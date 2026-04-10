from __future__ import annotations

import csv
import os
import re
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

# Controle opcional
LIMIT = int(os.getenv("LIMIT", "0"))  # 0 = sem limite
SLEEP_SECONDS = float(os.getenv("SLEEP_SECONDS", "0"))


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def utc_now_iso() -> str:
    return utc_now().isoformat()


def utc_stamp() -> str:
    return utc_now().strftime("%Y%m%dT%H%M%SZ")


def sanitize_filename(value: str) -> str:
    value = re.sub(r"[^\w\-\.]+", "_", value.strip(), flags=re.UNICODE)
    return value.strip("_") or "arquivo"


def text_clean(value: str | None) -> str | None:
    if value is None:
        return None
    value = re.sub(r"\s+", " ", value).strip()
    return value or None


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


def fetch_html(session: requests.Session, url: str) -> str:
    response = session.get(url, timeout=120)
    response.raise_for_status()
    response.encoding = response.apparent_encoding or "utf-8"
    return response.text


def download_file(session: requests.Session, url: str, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with session.get(url, timeout=120, stream=True) as response:
        response.raise_for_status()
        with open(out_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)


def load_codes_from_db(path: Path) -> list[str]:
    if not path.exists():
        raise FileNotFoundError(f"Arquivo não encontrado: {path}")

    df = pd.read_csv(path, dtype=str)

    candidate_columns = ["codigo_ponto", "codigo", "ponto", "cod_poco", "cod"]

    selected_column = None
    for col in candidate_columns:
        if col in df.columns:
            selected_column = col
            break

    if selected_column is None:
        raise ValueError(
            "Nenhuma coluna de código encontrada em data/db/pocos_db.csv. "
            "Colunas aceitas: codigo_ponto, codigo, ponto, cod_poco, cod"
        )

    codes = [
        str(v).strip()
        for v in df[selected_column].dropna().tolist()
        if str(v).strip()
    ]

    # preserva ordem e remove duplicados
    seen = set()
    unique_codes = []
    for code in codes:
        if code not in seen:
            seen.add(code)
            unique_codes.append(code)

    if LIMIT > 0:
        unique_codes = unique_codes[:LIMIT]

    return unique_codes


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
        out[key] = text_clean(match.group(1)) if match else None

    return out


def find_tab_names(soup: BeautifulSoup) -> list[str]:
    names: list[str] = []
    valid = {
        "Gerais",
        "Construtivos",
        "Geológicos",
        "Hidrogeológicos",
        "Teste de Bombeamento",
        "Análises Químicas",
    }

    for element in soup.find_all(["a", "li", "span", "div", "td"]):
        txt = text_clean(element.get_text(" ", strip=True))
        if txt in valid and txt not in names:
            names.append(txt)

    return names


def parse_label_value_table(table: Tag) -> dict[str, Any]:
    data: dict[str, Any] = {}

    for row in table.find_all("tr"):
        cells = row.find_all(["td", "th"])
        if len(cells) < 2:
            continue

        label = text_clean(cells[0].get_text(" ", strip=True))
        value = text_clean(cells[1].get_text(" ", strip=True))

        if not label:
            continue

        label = label.rstrip(":")
        if value is None:
            value = ""

        if label in data and data[label] != value:
            idx = 2
            new_label = f"{label}_{idx}"
            while new_label in data:
                idx += 1
                new_label = f"{label}_{idx}"
            data[new_label] = value
        else:
            data[label] = value

    return data


def nearest_tab_name(table: Tag, known_tabs: list[str]) -> str | None:
    current = table
    for _ in range(10):
        current = current.find_previous(["div", "table", "ul", "tr", "td", "span", "a", "li"])
        if current is None:
            break
        txt = text_clean(current.get_text(" ", strip=True))
        if txt in known_tabs:
            return txt
    return None


def extract_all_tables(soup: BeautifulSoup) -> dict[str, Any]:
    known_tabs = find_tab_names(soup)
    out: dict[str, Any] = {}

    for table in soup.find_all("table"):
        table_data = parse_label_value_table(table)
        if not table_data:
            continue

        section = nearest_tab_name(table, known_tabs)

        for key, value in table_data.items():
            final_key = f"{section}__{key}" if section else key

            if final_key in out and out[final_key] != value:
                idx = 2
                alt_key = f"{final_key}_{idx}"
                while alt_key in out:
                    idx += 1
                    alt_key = f"{final_key}_{idx}"
                out[alt_key] = value
            else:
                out[final_key] = value

    return out


def save_inline_svg(codigo_ponto: str, container: Tag) -> tuple[str | None, str | None]:
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

    # 1) SVG inline
    src_url, local_path = save_inline_svg(codigo_ponto, container)
    if local_path:
        return src_url, local_path

    # 2) IMG
    img = container.find("img")
    if img and img.get("src"):
        src = urljoin(detail_url, img["src"])
        ext = Path(urlparse(src).path).suffix or ".png"
        local_name = f"{sanitize_filename(codigo_ponto)}{ext}"
        local_file = RAW_IMG_DIR / local_name
        download_file(session, src, local_file)
        return src, str(local_file.relative_to(ROOT))

    # 3) OBJECT/EMBED/IFRAME
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


def scrape_well_detail(session: requests.Session, codigo_ponto: str) -> dict[str, Any]:
    detail_url = build_detail_url(codigo_ponto)
    html = fetch_html(session, detail_url)

    html_path = RAW_HTML_DIR / f"{sanitize_filename(codigo_ponto)}.html"
    save_text(html_path, html)

    soup = BeautifulSoup(html, "lxml")

    row: dict[str, Any] = {
        "codigo_ponto": codigo_ponto,
        "url_detalhe": detail_url,
        "html_local": str(html_path.relative_to(ROOT)),
        "updated_at_utc": utc_now_iso(),
    }

    row.update(extract_header_fields(soup))
    row.update(extract_all_tables(soup))

    imagem_url, imagem_local = save_profile_image(session, codigo_ponto, soup, detail_url)
    row["imagem_origem_url"] = imagem_url
    row["imagem_local"] = imagem_local

    # se o cabeçalho trouxe outro código, preserva para conferência
    if "codigo_ponto_header" in row and row["codigo_ponto_header"]:
        row["codigo_ponto_confere"] = str(row["codigo_ponto_header"]) == str(codigo_ponto)
    else:
        row["codigo_ponto_confere"] = None

    return row


def main() -> None:
    codigos = load_codes_from_db(DB_CSV)
    print(f"Total de códigos lidos: {len(codigos)}")

    session = make_session()
    rows: list[dict[str, Any]] = []

    for i, codigo in enumerate(codigos, start=1):
        print(f"[{i}/{len(codigos)}] Processando poço {codigo}...")
        try:
            row = scrape_well_detail(session, codigo)
            row["status"] = "success"
            row["erro"] = None
        except Exception as exc:
            row = {
                "codigo_ponto": codigo,
                "url_detalhe": build_detail_url(codigo),
                "html_local": None,
                "imagem_origem_url": None,
                "imagem_local": None,
                "updated_at_utc": utc_now_iso(),
                "status": "error",
                "erro": str(exc),
            }
        rows.append(row)

        if SLEEP_SECONDS > 0:
            import time
            time.sleep(SLEEP_SECONDS)

    df = pd.DataFrame(rows)

    out_csv = PROCESSED_DIR / "siagas_pocos_detalhes.csv"
    out_snapshot = PROCESSED_DIR / f"siagas_pocos_detalhes_{utc_stamp()}.csv"
    df.to_csv(out_csv, index=False, encoding="utf-8-sig", quoting=csv.QUOTE_MINIMAL)
    df.to_csv(out_snapshot, index=False, encoding="utf-8-sig", quoting=csv.QUOTE_MINIMAL)

    metadata = {
        "updated_at_utc": utc_now_iso(),
        "source_csv": str(DB_CSV.relative_to(ROOT)),
        "total_codigos_lidos": len(codigos),
        "total_registros_saida": int(len(df)),
        "success_count": int((df["status"] == "success").sum()) if "status" in df.columns else 0,
        "error_count": int((df["status"] == "error").sum()) if "status" in df.columns else 0,
        "html_dir": str(RAW_HTML_DIR.relative_to(ROOT)),
        "img_dir": str(RAW_IMG_DIR.relative_to(ROOT)),
        "output_csv": str(out_csv.relative_to(ROOT)),
    }

    metadata_path = PROCESSED_DIR / "siagas_pocos_detalhes_metadata.json"
    metadata_path.write_text(
        pd.Series(metadata).to_json(force_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"CSV salvo em: {out_csv}")
    print(f"Metadata salva em: {metadata_path}")


if __name__ == "__main__":
    main()