from __future__ import annotations

import os
import re
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

import pandas as pd
import requests
from bs4 import BeautifulSoup, Tag


ROOT = Path(__file__).resolve().parents[1]

DB_CSV = ROOT / "data" / "db" / "pocos_db.csv"
RAW_HTML_DIR = ROOT / "data" / "raw" / "html_pocos"
RAW_IMG_DIR = ROOT / "data" / "raw" / "imagens_pocos"
PROCESSED_DIR = ROOT / "data" / "processed"

RAW_HTML_DIR.mkdir(parents=True, exist_ok=True)
RAW_IMG_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

BASE_URL = os.getenv("SIAGAS_BASE_URL", "https://siagasweb.sgb.gov.br").rstrip("/")
DETAIL_PATH = os.getenv("SIAGAS_DETAIL_PATH", "layout/detalhe.php")
USER_AGENT = os.getenv(
    "SIAGAS_USER_AGENT",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0 Safari/537.36",
)

LIMIT = int(os.getenv("LIMIT", "0"))
SLEEP_SECONDS = float(os.getenv("SLEEP_SECONDS", "0.2"))


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def utc_now_iso() -> str:
    return utc_now().isoformat()


def utc_stamp() -> str:
    return utc_now().strftime("%Y%m%dT%H%M%SZ")


def normalize_text(value: Any) -> str:
    if value is None:
        return ""
    value = str(value).replace("\xa0", " ")
    value = re.sub(r"\s+", " ", value).strip()
    return value


def normalize_key(value: str) -> str:
    value = normalize_text(value).rstrip(":")
    value = unicodedata.normalize("NFKD", value)
    value = value.encode("ascii", "ignore").decode("ascii")
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "_", value)
    value = re.sub(r"_+", "_", value).strip("_")
    return value


def sanitize_filename(value: str) -> str:
    value = unicodedata.normalize("NFKD", str(value))
    value = value.encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^\w\-\.]+", "_", value.strip())
    return value.strip("_") or "arquivo"


def make_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": USER_AGENT,
            "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        }
    )
    return session


def build_detail_url(codigo_ponto: str) -> str:
    return f"{BASE_URL}/{DETAIL_PATH}?ponto={codigo_ponto}"


def save_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def download_file(session: requests.Session, url: str, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with session.get(url, timeout=120, stream=True) as response:
        response.raise_for_status()
        with open(out_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)


def fetch_html(session: requests.Session, url: str) -> str:
    response = session.get(url, timeout=120)
    response.raise_for_status()
    response.encoding = response.apparent_encoding or "utf-8"
    return response.text


def load_codes_from_db(path: Path) -> list[str]:
    if not path.exists():
        raise FileNotFoundError(f"Arquivo não encontrado: {path}")

    df = pd.read_csv(path, dtype=str, encoding="utf-8-sig")

    candidate_columns = ["codigo_ponto", "codigo", "ponto", "cod_poco", "cod"]
    selected_column = next((c for c in candidate_columns if c in df.columns), None)

    if selected_column is None:
        raise ValueError(
            "Nenhuma coluna de código encontrada em data/db/pocos_db.csv. "
            "Colunas aceitas: codigo_ponto, codigo, ponto, cod_poco, cod"
        )

    codes = [
        normalize_text(v)
        for v in df[selected_column].dropna().tolist()
        if normalize_text(v)
    ]

    seen = set()
    unique_codes: list[str] = []
    for code in codes:
        if code not in seen:
            seen.add(code)
            unique_codes.append(code)

    if LIMIT > 0:
        unique_codes = unique_codes[:LIMIT]

    return unique_codes


def rows_from_table(table: Tag) -> list[list[str]]:
    rows: list[list[str]] = []
    for tr in table.find_all("tr"):
        cells = tr.find_all(["th", "td"])
        if not cells:
            continue
        row = [normalize_text(cell.get_text(" ", strip=True)) for cell in cells]
        if any(row):
            rows.append(row)
    return rows


def find_tables(soup: BeautifulSoup) -> list[list[list[str]]]:
    parsed: list[list[list[str]]] = []
    for table in soup.find_all("table"):
        rows = rows_from_table(table)
        if rows:
            parsed.append(rows)
    return parsed


def table_has_text(rows: list[list[str]], text: str) -> bool:
    text_norm = normalize_text(text).lower()
    for row in rows:
        if text_norm in " ".join(row).lower():
            return True
    return False


def first_nonempty(row: list[str]) -> str:
    for cell in row:
        if normalize_text(cell):
            return normalize_text(cell)
    return ""


def is_single_title_row(row: list[str]) -> bool:
    nonempty = [normalize_text(c) for c in row if normalize_text(c)]
    return len(nonempty) == 1


def parse_header_fields(soup: BeautifulSoup) -> dict[str, Any]:
    text = soup.get_text(" ", strip=True)

    patterns = {
        "codigo_ponto_header": r"Poço:\s*(\d+)",
        "uf": r"UF:\s*([A-Z]{2})",
        "municipio": r"Município:\s*(.+?)\s+Localidade:",
        "localidade_header": r"Localidade:\s*(.+?)(?:Gerais|Construtivos|Geológicos|Hidrogeológicos|Teste de Bombeamento|Análises Químicas)",
    }

    out: dict[str, Any] = {}
    for key, pattern in patterns.items():
        match = re.search(pattern, text, flags=re.IGNORECASE)
        out[key] = normalize_text(match.group(1)) if match else ""
    return out


def parse_pairs_in_row(row: list[str]) -> dict[str, str]:
    out: dict[str, str] = {}
    i = 0
    while i < len(row):
        label = normalize_text(row[i])
        value = normalize_text(row[i + 1]) if i + 1 < len(row) else ""
        if label.endswith(":"):
            out[normalize_key(label)] = value
            i += 2
        else:
            i += 1
    return out


def parse_gerais(rows: list[list[str]], codigo_ponto: str, header: dict[str, Any], base: dict[str, Any]) -> dict[str, Any]:
    record = {"codigo_ponto": codigo_ponto, **header, **base}
    current_block = ""

    for row in rows:
        if is_single_title_row(row):
            current_block = normalize_key(first_nonempty(row))
            continue

        pairs = parse_pairs_in_row(row)
        for k, v in pairs.items():
            key = f"{current_block}__{k}" if current_block else k
            record[key] = v

    return record


def parse_construtivos(rows: list[list[str]], codigo_ponto: str, base: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    resumo = {"codigo_ponto": codigo_ponto, **base}
    intervalos: list[dict[str, Any]] = []

    block = ""
    i = 0
    while i < len(rows):
        row = rows[i]

        if is_single_title_row(row):
            block = first_nonempty(row)
            i += 1
            continue

        if block in {"Perfuração:", "Boca do Tubo:", "Profundidade Útil:"}:
            for k, v in parse_pairs_in_row(row).items():
                resumo[f"{normalize_key(block)}__{k}"] = v
            i += 1
            continue

        if block in {"Diâmetro:", "Revestimento:", "Filtro:", "Espaço Anular:", "Entrada d'água:"}:
            headers = [normalize_key(c) for c in row if normalize_text(c)]
            i += 1
            while i < len(rows):
                next_row = rows[i]
                if is_single_title_row(next_row):
                    break
                vals = [normalize_text(c) for c in next_row if normalize_text(c)]
                if vals:
                    rec = {
                        "codigo_ponto": codigo_ponto,
                        "bloco": normalize_key(block),
                    }
                    padded = vals + [""] * (len(headers) - len(vals))
                    padded = padded[: len(headers)]
                    for h, v in zip(headers, padded):
                        rec[h] = v
                    intervalos.append(rec)
                i += 1
            continue

        i += 1

    return resumo, intervalos


def parse_geologicos(rows: list[list[str]], codigo_ponto: str, base: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    resumo = {"codigo_ponto": codigo_ponto, **base}
    formacoes: list[dict[str, Any]] = []
    litologias: list[dict[str, Any]] = []

    block = ""
    i = 0
    while i < len(rows):
        row = rows[i]

        if is_single_title_row(row):
            block = first_nonempty(row)
            i += 1
            continue

        if block == "Feição Geomorfológica:":
            for k, v in parse_pairs_in_row(row).items():
                resumo[f"feicao_geomorfologica__{k}"] = v
            i += 1
            continue

        if block == "Formação Geológica:":
            headers = [normalize_key(c) for c in row if normalize_text(c)]
            i += 1
            while i < len(rows):
                next_row = rows[i]
                if is_single_title_row(next_row):
                    break
                vals = [normalize_text(c) for c in next_row if normalize_text(c)]
                if vals:
                    rec = {"codigo_ponto": codigo_ponto}
                    padded = vals + [""] * (len(headers) - len(vals))
                    padded = padded[: len(headers)]
                    for h, v in zip(headers, padded):
                        rec[h] = v
                    formacoes.append(rec)
                i += 1
            continue

        if block == "Dados Litológicos:":
            headers = [normalize_key(c) for c in row if normalize_text(c)]
            i += 1
            while i < len(rows):
                next_row = rows[i]
                if is_single_title_row(next_row):
                    break
                vals = [normalize_text(c) for c in next_row if normalize_text(c)]
                if vals:
                    rec = {"codigo_ponto": codigo_ponto}
                    padded = vals + [""] * (len(headers) - len(vals))
                    padded = padded[: len(headers)]
                    for h, v in zip(headers, padded):
                        rec[h] = v
                    litologias.append(rec)
                i += 1
            continue

        i += 1

    return resumo, formacoes, litologias


def parse_hidrogeologicos(rows: list[list[str]], codigo_ponto: str, base: dict[str, Any]) -> dict[str, Any]:
    record = {"codigo_ponto": codigo_ponto, **base}
    block = ""

    for row in rows:
        if is_single_title_row(row):
            block = normalize_key(first_nonempty(row))
            continue

        for k, v in parse_pairs_in_row(row).items():
            key = f"{block}__{k}" if block else k
            record[key] = v

        joined = " | ".join([normalize_text(c) for c in row if normalize_text(c)])
        m = re.search(r"Aquífero:\s*(.+)", joined, flags=re.IGNORECASE)
        if m:
            record["aquifero_no_ponto__aquifero"] = normalize_text(m.group(1))

    return record


def parse_teste_bombeamento(rows: list[list[str]], codigo_ponto: str, base: dict[str, Any]) -> dict[str, Any]:
    record = {"codigo_ponto": codigo_ponto, **base}
    block = ""

    for row in rows:
        if is_single_title_row(row):
            block = normalize_key(first_nonempty(row))
            continue

        for k, v in parse_pairs_in_row(row).items():
            key = f"{block}__{k}" if block else k
            record[key] = v

    return record


def parse_analises(rows: list[list[str]], codigo_ponto: str, base: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    resumo = {"codigo_ponto": codigo_ponto, **base}
    parametros: list[dict[str, Any]] = []

    current_block = ""
    i = 0
    while i < len(rows):
        row = rows[i]
        joined = " ".join(row)

        if is_single_title_row(row):
            current_block = first_nonempty(row)
            i += 1
            continue

        # bloco resumo
        if current_block == "Análises Químicas:":
            # detecta início do subtipo de resultados
            if "Parâmetro:" in joined or "Parâmetro" in joined and "Concentração:" in joined:
                current_block = "Resultados Analíticos da Última Coleta:"
                continue

            for k, v in parse_pairs_in_row(row).items():
                resumo[f"analises_quimicas__{k}"] = v
            i += 1
            continue

        # bloco parâmetros
        if current_block == "Resultados Analíticos da Última Coleta:":
            header_cells = [normalize_text(c) for c in row if normalize_text(c)]

            # cabeçalho esperado
            if len(header_cells) >= 3 and (
                "Parâmetro:" in header_cells[0] or "Parâmetro" in header_cells[0]
            ):
                i += 1
                while i < len(rows):
                    next_row = rows[i]

                    if is_single_title_row(next_row):
                        break

                    vals = [normalize_text(c) for c in next_row if normalize_text(c)]
                    if not vals:
                        i += 1
                        continue

                    # ignora início do gráfico
                    joined_next = " ".join(vals).lower()
                    if "gráfico de evolução" in joined_next or "grafico de evolucao" in joined_next:
                        break

                    if len(vals) >= 3:
                        parametros.append(
                            {
                                "codigo_ponto": codigo_ponto,
                                "parametro": vals[0],
                                "concentracao": vals[1],
                                "unidade": vals[2],
                            }
                        )
                    elif len(vals) == 2:
                        parametros.append(
                            {
                                "codigo_ponto": codigo_ponto,
                                "parametro": vals[0],
                                "concentracao": vals[1],
                                "unidade": "",
                            }
                        )
                    i += 1
                continue

        i += 1

    return resumo, parametros


def collect_candidate_image_urls(soup: BeautifulSoup, detail_url: str) -> list[str]:
    candidates: list[str] = []

    for tag in soup.find_all(["img", "object", "embed", "iframe"]):
        for attr in ["src", "data"]:
            value = tag.get(attr)
            if value:
                candidates.append(urljoin(detail_url, value))

    # tenta capturar URLs em scripts/HTML
    html_text = str(soup)
    patterns = [
        r"""['"]([^'"]+\.(?:png|jpg|jpeg|gif|svg))['"]""",
        r"""['"]([^'"]*(?:perfil|svgContainer|litolog|grafico|imagem)[^'"]*)['"]""",
    ]
    for pattern in patterns:
        for match in re.findall(pattern, html_text, flags=re.IGNORECASE):
            if match:
                candidates.append(urljoin(detail_url, match))

    # prioriza urls mais promissoras
    scored: list[tuple[int, str]] = []
    for url in candidates:
        score = 0
        low = url.lower()
        if "perfil" in low:
            score += 5
        if "svg" in low:
            score += 4
        if "imagem" in low or "image" in low:
            score += 2
        if "icon" in low or "menu" in low:
            score -= 5
        scored.append((score, url))

    # remove duplicados preservando ordem pela melhor pontuação
    scored.sort(key=lambda x: x[0], reverse=True)
    result: list[str] = []
    seen = set()
    for _, url in scored:
        if url not in seen:
            seen.add(url)
            result.append(url)
    return result


def save_profile_image(session: requests.Session, codigo_ponto: str, soup: BeautifulSoup, detail_url: str) -> tuple[str, str]:
    # 1) tenta svg inline em qualquer lugar da página
    svg = soup.find("svg")
    if svg is not None:
        local_name = f"{sanitize_filename(codigo_ponto)}.svg"
        local_path = RAW_IMG_DIR / local_name
        save_text(local_path, str(svg))
        return "", str(local_path.relative_to(ROOT))

    # 2) tenta candidatos por tags/atributos/scripts
    candidates = collect_candidate_image_urls(soup, detail_url)
    for url in candidates:
        try:
            path_suffix = Path(urlparse(url).path).suffix.lower()
            if path_suffix not in {".svg", ".png", ".jpg", ".jpeg", ".gif", ""}:
                continue

            ext = path_suffix if path_suffix else ".png"
            local_name = f"{sanitize_filename(codigo_ponto)}{ext}"
            local_path = RAW_IMG_DIR / local_name
            download_file(session, url, local_path)

            # evita salvar ícones minúsculos
            if local_path.exists() and local_path.stat().st_size > 2000:
                return url, str(local_path.relative_to(ROOT))
        except Exception:
            continue

    return "", ""


def scrape_well_detail(session: requests.Session, codigo_ponto: str) -> dict[str, Any]:
    detail_url = build_detail_url(codigo_ponto)
    html = fetch_html(session, detail_url)

    html_path = RAW_HTML_DIR / f"{sanitize_filename(codigo_ponto)}.html"
    save_text(html_path, html)

    soup = BeautifulSoup(html, "lxml")
    tables = find_tables(soup)

    header = parse_header_fields(soup)

    base = {
        "url_detalhe": detail_url,
        "html_local": str(html_path.relative_to(ROOT)),
        "updated_at_utc": utc_now_iso(),
    }

    imagem_url, imagem_local = save_profile_image(session, codigo_ponto, soup, detail_url)

    out: dict[str, Any] = {
        "cadastro": [],
        "construtivos_resumo": [],
        "construtivos_intervalos": [],
        "geologia_formacao": [],
        "geologia_litologia": [],
        "hidrogeologia": [],
        "teste_bombeamento": [],
        "analises_resumo": [],
        "analises_parametros": [],
        "imagens": [],
    }

    found_gerais = False

    for rows in tables:
        if table_has_text(rows, "Dados Gerais:"):
            rec = parse_gerais(rows, codigo_ponto, header, base)
            rec["imagem_origem_url"] = imagem_url
            rec["imagem_local"] = imagem_local
            out["cadastro"].append(rec)
            found_gerais = True
            continue

        if table_has_text(rows, "Perfuração:"):
            resumo, intervalos = parse_construtivos(rows, codigo_ponto, base)
            out["construtivos_resumo"].append(resumo)
            out["construtivos_intervalos"].extend(intervalos)
            continue

        if table_has_text(rows, "Formação Geológica:") or table_has_text(rows, "Dados Litológicos:"):
            resumo, formacoes, litologias = parse_geologicos(rows, codigo_ponto, base)
            if len(resumo) > 2:
                # reservado caso queira usar depois
                pass
            out["geologia_formacao"].extend(formacoes)
            out["geologia_litologia"].extend(litologias)
            continue

        if table_has_text(rows, "Aquífero no Ponto") or table_has_text(rows, "Nível da Água:"):
            rec = parse_hidrogeologicos(rows, codigo_ponto, base)
            out["hidrogeologia"].append(rec)
            continue

        if table_has_text(rows, "Teste de Bombeamento:"):
            rec = parse_teste_bombeamento(rows, codigo_ponto, base)
            out["teste_bombeamento"].append(rec)
            continue

        if table_has_text(rows, "Análises Químicas:"):
            resumo, parametros = parse_analises(rows, codigo_ponto, base)
            out["analises_resumo"].append(resumo)
            out["analises_parametros"].extend(parametros)
            continue

    if not found_gerais:
        rec = {
            "codigo_ponto": codigo_ponto,
            **header,
            **base,
            "imagem_origem_url": imagem_url,
            "imagem_local": imagem_local,
        }
        out["cadastro"].append(rec)

    out["imagens"].append(
        {
            "codigo_ponto": codigo_ponto,
            "url_detalhe": detail_url,
            "imagem_origem_url": imagem_url,
            "imagem_local": imagem_local,
            "html_local": str(html_path.relative_to(ROOT)),
            "updated_at_utc": utc_now_iso(),
        }
    )

    return out


def save_df(records: list[dict[str, Any]], path: Path) -> None:
    df = pd.DataFrame(records) if records else pd.DataFrame()
    df.to_csv(path, index=False, sep=";", encoding="utf-8-sig")


def main() -> None:
    codigos = load_codes_from_db(DB_CSV)
    print(f"Total de códigos lidos: {len(codigos)}")

    session = make_session()

    cadastro_records: list[dict[str, Any]] = []
    construtivos_resumo_records: list[dict[str, Any]] = []
    construtivos_intervalos_records: list[dict[str, Any]] = []
    geologia_formacao_records: list[dict[str, Any]] = []
    geologia_litologia_records: list[dict[str, Any]] = []
    hidrogeologia_records: list[dict[str, Any]] = []
    teste_bombeamento_records: list[dict[str, Any]] = []
    analises_resumo_records: list[dict[str, Any]] = []
    analises_parametros_records: list[dict[str, Any]] = []
    imagens_records: list[dict[str, Any]] = []
    erros_records: list[dict[str, Any]] = []

    for i, codigo in enumerate(codigos, start=1):
        print(f"[{i}/{len(codigos)}] Processando poço {codigo}...")
        try:
            result = scrape_well_detail(session, codigo)

            cadastro_records.extend(result["cadastro"])
            construtivos_resumo_records.extend(result["construtivos_resumo"])
            construtivos_intervalos_records.extend(result["construtivos_intervalos"])
            geologia_formacao_records.extend(result["geologia_formacao"])
            geologia_litologia_records.extend(result["geologia_litologia"])
            hidrogeologia_records.extend(result["hidrogeologia"])
            teste_bombeamento_records.extend(result["teste_bombeamento"])
            analises_resumo_records.extend(result["analises_resumo"])
            analises_parametros_records.extend(result["analises_parametros"])
            imagens_records.extend(result["imagens"])
        except Exception as exc:
            erros_records.append(
                {
                    "codigo_ponto": codigo,
                    "url_detalhe": build_detail_url(codigo),
                    "erro": str(exc),
                    "updated_at_utc": utc_now_iso(),
                }
            )

        if SLEEP_SECONDS > 0:
            time.sleep(SLEEP_SECONDS)

    save_df(cadastro_records, PROCESSED_DIR / "siagas_pocos_cadastro.csv")
    save_df(construtivos_resumo_records, PROCESSED_DIR / "siagas_construtivos_resumo.csv")
    save_df(construtivos_intervalos_records, PROCESSED_DIR / "siagas_construtivos_intervalos.csv")
    save_df(geologia_formacao_records, PROCESSED_DIR / "siagas_geologia_formacao.csv")
    save_df(geologia_litologia_records, PROCESSED_DIR / "siagas_geologia_litologia.csv")
    save_df(hidrogeologia_records, PROCESSED_DIR / "siagas_hidrogeologia.csv")
    save_df(teste_bombeamento_records, PROCESSED_DIR / "siagas_teste_bombeamento.csv")
    save_df(analises_resumo_records, PROCESSED_DIR / "siagas_analises_quimicas_resumo.csv")
    save_df(analises_parametros_records, PROCESSED_DIR / "siagas_analises_quimicas_parametros.csv")
    save_df(imagens_records, PROCESSED_DIR / "siagas_imagens.csv")
    save_df(erros_records, PROCESSED_DIR / "siagas_erros_scraping.csv")

    metadata = pd.DataFrame(
        [
            {
                "updated_at_utc": utc_now_iso(),
                "source_csv": str(DB_CSV.relative_to(ROOT)),
                "total_codigos_lidos": len(codigos),
                "cadastro_rows": len(cadastro_records),
                "construtivos_resumo_rows": len(construtivos_resumo_records),
                "construtivos_intervalos_rows": len(construtivos_intervalos_records),
                "geologia_formacao_rows": len(geologia_formacao_records),
                "geologia_litologia_rows": len(geologia_litologia_records),
                "hidrogeologia_rows": len(hidrogeologia_records),
                "teste_bombeamento_rows": len(teste_bombeamento_records),
                "analises_resumo_rows": len(analises_resumo_records),
                "analises_parametros_rows": len(analises_parametros_records),
                "imagens_rows": len(imagens_records),
                "erros_rows": len(erros_records),
            }
        ]
    )
    metadata.to_csv(
        PROCESSED_DIR / "siagas_metadata.csv",
        index=False,
        sep=";",
        encoding="utf-8-sig",
    )

    print("Processo finalizado.")


if __name__ == "__main__":
    main()
