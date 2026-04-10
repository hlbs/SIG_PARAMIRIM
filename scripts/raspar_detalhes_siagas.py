from __future__ import annotations

import os
import re
import time
import unicodedata
from datetime import datetime, timezone
from io import StringIO
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

import pandas as pd
import requests
from bs4 import BeautifulSoup


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


# =========================
# UTILITÁRIOS
# =========================
def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def utc_now_iso() -> str:
    return utc_now().isoformat()


def utc_stamp() -> str:
    return utc_now().strftime("%Y%m%dT%H%M%SZ")


def normalize_text(value: Any) -> str:
    if value is None:
        return ""
    value = str(value)
    value = value.replace("\xa0", " ")
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


def rows_from_table(table) -> list[list[str]]:
    rows: list[list[str]] = []
    for tr in table.find_all("tr"):
        cells = tr.find_all(["th", "td"])
        if not cells:
            continue
        row = [normalize_text(cell.get_text(" ", strip=True)) for cell in cells]
        if any(row):
            rows.append(row)
    return rows


def table_contains(rows: list[list[str]], text: str) -> bool:
    text_norm = normalize_text(text).lower()
    for row in rows:
        joined = " ".join(row).lower()
        if text_norm in joined:
            return True
    return False


def is_block_title(row: list[str]) -> bool:
    nonempty = [c for c in row if c]
    if len(nonempty) != 1:
        return False

    txt = nonempty[0]
    known_titles = {
        "Dados Gerais:",
        "Localização:",
        "Situação:",
        "Perfuração:",
        "Diâmetro:",
        "Revestimento:",
        "Filtro:",
        "Espaço Anular:",
        "Boca do Tubo:",
        "Entrada d'água:",
        "Profundidade Útil:",
        "Feição Geomorfológica:",
        "Formação Geológica:",
        "Dados Litológicos:",
        "Aquífero no Ponto",
        "Nível da Água:",
        "Teste de Bombeamento:",
        "Análises Químicas:",
        "Resultados Analíticos da Última Coleta:",
    }
    return txt in known_titles or txt.endswith(":")


def parse_pairs_from_row(row: list[str]) -> dict[str, str]:
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


def parse_key_value_sections(rows: list[list[str]]) -> dict[str, str]:
    """
    Para blocos como Gerais, Hidrogeologia, Teste de Bombeamento.
    """
    out: dict[str, str] = {}
    current_section = None

    for row in rows:
        if is_block_title(row):
            nonempty = [c for c in row if c]
            current_section = normalize_key(nonempty[0])
            continue

        pairs = parse_pairs_from_row(row)
        for key, value in pairs.items():
            final_key = f"{current_section}__{key}" if current_section else key
            out[final_key] = value

    return out


def find_table_after_title(rows: list[list[str]], title: str) -> tuple[list[str], list[list[str]]]:
    """
    Localiza um bloco do tipo:
    Título:
    cabeçalhos
    valores...
    """
    for i, row in enumerate(rows):
        nonempty = [c for c in row if c]
        if len(nonempty) == 1 and nonempty[0] == title:
            # primeira linha seguinte com conteúdo é header
            j = i + 1
            while j < len(rows) and not any(rows[j]):
                j += 1
            if j >= len(rows):
                return [], []

            headers = [normalize_key(c) for c in rows[j] if c]
            data_rows: list[list[str]] = []
            k = j + 1
            while k < len(rows):
                if is_block_title(rows[k]):
                    break
                if any(rows[k]):
                    vals = [normalize_text(c) for c in rows[k] if c]
                    if vals:
                        data_rows.append(vals)
                k += 1

            return headers, data_rows

    return [], []


def to_records(
    codigo_ponto: str,
    headers: list[str],
    data_rows: list[list[str]],
    extra: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    extra = extra or {}

    for row in data_rows:
        rec: dict[str, Any] = {"codigo_ponto": codigo_ponto, **extra}
        padded = row + [""] * (len(headers) - len(row))
        padded = padded[: len(headers)]

        for h, v in zip(headers, padded):
            rec[h] = v
        records.append(rec)

    return records


# =========================
# EXTRAÇÃO DO CABEÇALHO
# =========================
def extract_header_fields(soup: BeautifulSoup) -> dict[str, Any]:
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


# =========================
# IMAGENS
# =========================
def save_inline_svg(codigo_ponto: str, container) -> tuple[str | None, str | None]:
    svg = container.find("svg")
    if svg is None:
        return None, None

    local_name = f"{sanitize_filename(codigo_ponto)}.svg"
    local_path = RAW_IMG_DIR / local_name
    save_text(local_path, str(svg))
    return None, str(local_path.relative_to(ROOT))


def save_profile_image(
    session: requests.Session,
    codigo_ponto: str,
    soup: BeautifulSoup,
    detail_url: str,
) -> tuple[str | None, str | None]:
    container = soup.find(id="svgContainer")
    if container is None:
        return None, None

    src_url, local_path = save_inline_svg(codigo_ponto, container)
    if local_path:
        return src_url, local_path

    img = container.find("img")
    if img and img.get("src"):
        src = urljoin(detail_url, img["src"])
        ext = Path(urlparse(src).path).suffix or ".png"
        local_name = f"{sanitize_filename(codigo_ponto)}{ext}"
        local_file = RAW_IMG_DIR / local_name
        download_file(session, src, local_file)
        return src, str(local_file.relative_to(ROOT))

    for tag_name in ["object", "embed", "iframe"]:
        tag = container.find(tag_name)
        candidate = None
        if tag:
            candidate = tag.get("data") or tag.get("src")
        if candidate:
            src = urljoin(detail_url, candidate)
            ext = Path(urlparse(src).path).suffix or ".svg"
            local_name = f"{sanitize_filename(codigo_ponto)}{ext}"
            local_file = RAW_IMG_DIR / local_name
            download_file(session, src, local_file)
            return src, str(local_file.relative_to(ROOT))

    return None, None


# =========================
# PARSERS POR ABA
# =========================
def parse_gerais_table(codigo_ponto: str, rows: list[list[str]], header: dict[str, Any]) -> dict[str, Any]:
    record = {"codigo_ponto": codigo_ponto, **header}
    record.update(parse_key_value_sections(rows))
    return record


def parse_construtivos_table(codigo_ponto: str, rows: list[list[str]]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    resumo = {"codigo_ponto": codigo_ponto}
    intervalos: list[dict[str, Any]] = []

    current_block = None
    i = 0
    while i < len(rows):
        row = rows[i]
        nonempty = [c for c in row if c]

        if is_block_title(row):
            current_block = nonempty[0]
            i += 1
            continue

        if current_block in {"Perfuração:", "Boca do Tubo:", "Profundidade Útil:"}:
            resumo.update(
                {f"{normalize_key(current_block)}__{k}": v for k, v in parse_pairs_from_row(row).items()}
            )
            i += 1
            continue

        if current_block in {"Diâmetro:", "Revestimento:", "Filtro:", "Espaço Anular:", "Entrada d'água:"}:
            headers = [normalize_key(c) for c in row if c]
            block_name = normalize_key(current_block)
            i += 1
            while i < len(rows) and not is_block_title(rows[i]):
                vals = [normalize_text(c) for c in rows[i] if c]
                if vals:
                    rec = {"codigo_ponto": codigo_ponto, "bloco": block_name}
                    padded = vals + [""] * (len(headers) - len(vals))
                    padded = padded[: len(headers)]
                    for h, v in zip(headers, padded):
                        rec[h] = v
                    intervalos.append(rec)
                i += 1
            continue

        i += 1

    return resumo, intervalos


def parse_geologicos_table(codigo_ponto: str, rows: list[list[str]]) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    resumo = {"codigo_ponto": codigo_ponto}
    formacoes: list[dict[str, Any]] = []
    litologias: list[dict[str, Any]] = []

    i = 0
    current_block = None

    while i < len(rows):
        row = rows[i]
        nonempty = [c for c in row if c]

        if is_block_title(row):
            current_block = nonempty[0]
            i += 1
            continue

        if current_block == "Feição Geomorfológica:":
            pairs = parse_pairs_from_row(row)
            for k, v in pairs.items():
                resumo[f"feicao_geomorfologica__{k}"] = v
            i += 1
            continue

        if current_block == "Formação Geológica:":
            headers = [normalize_key(c) for c in row if c]
            i += 1
            while i < len(rows) and not is_block_title(rows[i]):
                vals = [normalize_text(c) for c in rows[i] if c]
                if vals:
                    rec = {"codigo_ponto": codigo_ponto}
                    padded = vals + [""] * (len(headers) - len(vals))
                    padded = padded[: len(headers)]
                    for h, v in zip(headers, padded):
                        rec[h] = v
                    formacoes.append(rec)
                i += 1
            continue

        if current_block == "Dados Litológicos:":
            headers = [normalize_key(c) for c in row if c]
            i += 1
            while i < len(rows) and not is_block_title(rows[i]):
                vals = [normalize_text(c) for c in rows[i] if c]
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


def parse_hidrogeologicos_table(codigo_ponto: str, rows: list[list[str]]) -> dict[str, Any]:
    record = {"codigo_ponto": codigo_ponto}
    current_block = None

    for row in rows:
        nonempty = [c for c in row if c]

        if is_block_title(row):
            current_block = normalize_key(nonempty[0])
            continue

        pairs = parse_pairs_from_row(row)
        for k, v in pairs.items():
            if current_block:
                record[f"{current_block}__{k}"] = v
            else:
                record[k] = v

        # caso especial: "Aquífero: Fissural"
        joined = " | ".join(nonempty)
        m = re.search(r"Aquífero:\s*(.+)", joined, flags=re.IGNORECASE)
        if m:
            record["aquifero_no_ponto__aquifero"] = normalize_text(m.group(1))

    return record


def parse_teste_bombeamento_table(codigo_ponto: str, rows: list[list[str]]) -> dict[str, Any]:
    record = {"codigo_ponto": codigo_ponto}
    record.update(parse_key_value_sections(rows))
    return record


def parse_analises_table(codigo_ponto: str, rows: list[list[str]]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    resumo = {"codigo_ponto": codigo_ponto}
    parametros: list[dict[str, Any]] = []

    current_block = None
    i = 0

    while i < len(rows):
        row = rows[i]
        nonempty = [c for c in row if c]

        if is_block_title(row):
            current_block = nonempty[0]
            i += 1
            continue

        if current_block == "Análises Químicas:":
            pairs = parse_pairs_from_row(row)
            for k, v in pairs.items():
                resumo[f"analises_quimicas__{k}"] = v
            i += 1
            continue

        if current_block == "Resultados Analíticos da Última Coleta:":
            headers = [normalize_key(c) for c in row if c]
            i += 1
            while i < len(rows) and not is_block_title(rows[i]):
                vals = [normalize_text(c) for c in rows[i] if c]
                if vals:
                    rec = {"codigo_ponto": codigo_ponto}
                    padded = vals + [""] * (len(headers) - len(vals))
                    padded = padded[: len(headers)]
                    for h, v in zip(headers, padded):
                        rec[h] = v
                    parametros.append(rec)
                i += 1
            continue

        i += 1

    return resumo, parametros


# =========================
# SCRAPING PRINCIPAL
# =========================
def scrape_well_detail(session: requests.Session, codigo_ponto: str) -> dict[str, Any]:
    detail_url = build_detail_url(codigo_ponto)
    html = fetch_html(session, detail_url)

    html_path = RAW_HTML_DIR / f"{sanitize_filename(codigo_ponto)}.html"
    save_text(html_path, html)

    soup = BeautifulSoup(html, "lxml")
    tables = soup.find_all("table")

    header = extract_header_fields(soup)
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

    cadastro_base = {
        "codigo_ponto": codigo_ponto,
        "url_detalhe": detail_url,
        "html_local": str(html_path.relative_to(ROOT)),
        "imagem_origem_url": imagem_url,
        "imagem_local": imagem_local,
        "updated_at_utc": utc_now_iso(),
    }

    gerais_found = False

    for table in tables:
        rows = rows_from_table(table)
        if not rows:
            continue

        if table_contains(rows, "Dados Gerais:"):
            rec = parse_gerais_table(codigo_ponto, rows, header)
            rec.update(cadastro_base)
            out["cadastro"].append(rec)
            gerais_found = True
            continue

        if table_contains(rows, "Perfuração:"):
            resumo, intervalos = parse_construtivos_table(codigo_ponto, rows)
            resumo.update(cadastro_base)
            out["construtivos_resumo"].append(resumo)
            out["construtivos_intervalos"].extend(intervalos)
            continue

        if table_contains(rows, "Formação Geológica:") or table_contains(rows, "Dados Litológicos:"):
            resumo, formacoes, litologias = parse_geologicos_table(codigo_ponto, rows)
            if resumo and len(resumo) > 1:
                pass
            out["geologia_formacao"].extend(formacoes)
            out["geologia_litologia"].extend(litologias)
            continue

        if table_contains(rows, "Aquífero no Ponto") or table_contains(rows, "Nível da Água:"):
            rec = parse_hidrogeologicos_table(codigo_ponto, rows)
            rec.update(cadastro_base)
            out["hidrogeologia"].append(rec)
            continue

        if table_contains(rows, "Teste de Bombeamento:"):
            rec = parse_teste_bombeamento_table(codigo_ponto, rows)
            rec.update(cadastro_base)
            out["teste_bombeamento"].append(rec)
            continue

        if table_contains(rows, "Análises Químicas:"):
            resumo, parametros = parse_analises_table(codigo_ponto, rows)
            resumo.update(cadastro_base)
            out["analises_resumo"].append(resumo)
            out["analises_parametros"].extend(parametros)
            continue

    if not gerais_found:
        rec = {"codigo_ponto": codigo_ponto, **header, **cadastro_base}
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
    if records:
        df = pd.DataFrame(records)
    else:
        df = pd.DataFrame()

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
