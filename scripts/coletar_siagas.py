from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
import requests
from bs4 import BeautifulSoup
from shapely.geometry import Point, shape


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed"
SHAPE_FILE = ROOT / "public" / "data" / "vetor" / "bacia_do_rio_paramirim_sirgas2000_utm23s_0.js"

RAW_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)


@dataclass
class AreaEnvelope:
    lat_north: float
    lat_south: float
    lon_west: float
    lon_east: float


def extract_geojson_from_js(js_path: Path) -> dict[str, Any]:
    if not js_path.exists():
        raise FileNotFoundError(f"Arquivo da bacia não encontrado: {js_path}")

    text = js_path.read_text(encoding="utf-8")
    match = re.search(r"=\s*(\{.*\})\s*;?\s*$", text, flags=re.DOTALL)

    if not match:
        raise ValueError(
            "Não foi possível extrair o GeoJSON do arquivo JS. "
            "Verifique se o arquivo possui o padrão: var nome = {...};"
        )

    return json.loads(match.group(1))


def build_basin_geometry(geojson: dict[str, Any]):
    features = geojson.get("features", [])
    if not features:
        raise ValueError("O GeoJSON não possui feições.")

    if len(features) == 1:
        return shape(features[0]["geometry"])

    from shapely.ops import unary_union
    geoms = [shape(feature["geometry"]) for feature in features]
    return unary_union(geoms)


def get_envelope(geom) -> AreaEnvelope:
    minx, miny, maxx, maxy = geom.bounds
    return AreaEnvelope(
        lat_north=maxy,
        lat_south=miny,
        lon_west=minx,
        lon_east=maxx,
    )


def decimal_to_dms(value: float) -> tuple[int, int, int]:
    abs_value = abs(value)
    degrees = int(abs_value)
    minutes_float = (abs_value - degrees) * 60
    minutes = int(minutes_float)
    seconds = round((minutes_float - minutes) * 60)

    if seconds == 60:
        seconds = 0
        minutes += 1

    if minutes == 60:
        minutes = 0
        degrees += 1

    return degrees, minutes, seconds


def build_search_payload(env: AreaEnvelope) -> dict[str, str]:
    """
    IMPORTANTE:
    Os nomes dos campos abaixo podem precisar de ajuste fino
    conforme o formulário real enviado pelo SIAGAS.
    """
    lat1_g, lat1_m, lat1_s = decimal_to_dms(env.lat_north)
    lon1_g, lon1_m, lon1_s = decimal_to_dms(env.lon_west)
    lat2_g, lat2_m, lat2_s = decimal_to_dms(env.lat_south)
    lon2_g, lon2_m, lon2_s = decimal_to_dms(env.lon_east)

    return {
        "hemisferio1": "S",
        "latgrau1": str(lat1_g),
        "latmin1": str(lat1_m),
        "latseg1": str(lat1_s),
        "longrau1": str(lon1_g),
        "lonmin1": str(lon1_m),
        "lonseg1": str(lon1_s),
        "hemisferio2": "S",
        "latgrau2": str(lat2_g),
        "latmin2": str(lat2_m),
        "latseg2": str(lat2_s),
        "longrau2": str(lon2_g),
        "lonmin2": str(lon2_m),
        "lonseg2": str(lon2_s),
        "tipo_coordenada": "geografica",
        "submit": "Pesquisar",
    }


def make_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": os.getenv("SIAGAS_USER_AGENT", "Mozilla/5.0"),
            "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        }
    )
    return session


def fetch_search_page(session: requests.Session, payload: dict[str, str]) -> str:
    base_url = os.getenv("SIAGAS_BASE_URL", "https://siagasweb.sgb.gov.br").rstrip("/")
    path = os.getenv("SIAGAS_SEARCH_PATH", "layout/pesquisa_coordenada.php").lstrip("/")
    url = f"{base_url}/{path}"

    response = session.post(url, data=payload, timeout=120)
    response.raise_for_status()
    response.encoding = response.apparent_encoding or "utf-8"
    return response.text


def detect_total_registros(html: str) -> int | None:
    patterns = [
        r"Sua pesquisa retornou\s+(\d+)\s+registros",
        r"retornou\s+(\d+)\s+registros",
    ]

    for pattern in patterns:
        match = re.search(pattern, html, flags=re.IGNORECASE)
        if match:
            return int(match.group(1))

    return None


def parse_result_table(html: str) -> pd.DataFrame:
    soup = BeautifulSoup(html, "lxml")
    tables = soup.find_all("table")
    target_table = None

    for table in tables:
        text = table.get_text(" ", strip=True).lower()
        if "código do ponto" in text and "município" in text:
            target_table = table
            break

    if target_table is None:
        raise ValueError("Tabela principal de resultados não encontrada no HTML.")

    rows: list[dict[str, str]] = []
    trs = target_table.find_all("tr")

    for tr in trs[1:]:
        tds = tr.find_all("td")
        if len(tds) < 4:
            continue

        codigo = tds[0].get_text(strip=True)
        uf = tds[1].get_text(strip=True)
        municipio = tds[2].get_text(strip=True)
        localidade = tds[3].get_text(strip=True)

        if not codigo or not any(ch.isdigit() for ch in codigo):
            continue

        rows.append(
            {
                "codigo_ponto": codigo,
                "uf": uf,
                "municipio": municipio,
                "localidade": localidade,
            }
        )

    df = pd.DataFrame(rows)

    if df.empty:
        return pd.DataFrame(columns=["codigo_ponto", "uf", "municipio", "localidade"])

    return df.drop_duplicates()


def extract_detail_links(html: str) -> dict[str, str]:
    soup = BeautifulSoup(html, "lxml")
    links: dict[str, str] = {}

    for a in soup.find_all("a", href=True):
        text = a.get_text(strip=True)
        if text.isdigit():
            links[text] = a["href"]

    return links


def absolutize_url(href: str) -> str:
    base_url = os.getenv("SIAGAS_BASE_URL", "https://siagasweb.sgb.gov.br").rstrip("/")

    if href.startswith("http://") or href.startswith("https://"):
        return href

    if href.startswith("/"):
        return f"{base_url}{href}"

    return f"{base_url}/{href}"


def parse_coordinates_from_detail(html: str) -> tuple[float | None, float | None]:
    soup = BeautifulSoup(html, "lxml")
    text = soup.get_text(" ", strip=True)

    lat = None
    lon = None

    lat_match = re.search(r"Latitude\s*[:\-]?\s*(-?\d+[.,]\d+)", text, flags=re.IGNORECASE)
    lon_match = re.search(r"Longitude\s*[:\-]?\s*(-?\d+[.,]\d+)", text, flags=re.IGNORECASE)

    if lat_match:
        lat = float(lat_match.group(1).replace(",", "."))

    if lon_match:
        lon = float(lon_match.group(1).replace(",", "."))

    return lat, lon


def fetch_detail_data(session: requests.Session, code_to_link: dict[str, str]) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []

    for codigo, href in code_to_link.items():
        url = absolutize_url(href)

        try:
            response = session.get(url, timeout=120)
            response.raise_for_status()
            response.encoding = response.apparent_encoding or "utf-8"

            lat, lon = parse_coordinates_from_detail(response.text)

            rows.append(
                {
                    "codigo_ponto": codigo,
                    "latitude": lat,
                    "longitude": lon,
                    "url_detalhe": url,
                    "erro_detalhe": None,
                }
            )
        except Exception as exc:
            rows.append(
                {
                    "codigo_ponto": codigo,
                    "latitude": None,
                    "longitude": None,
                    "url_detalhe": url,
                    "erro_detalhe": str(exc),
                }
            )

    return pd.DataFrame(rows)


def filter_points_in_basin(df: pd.DataFrame, basin_geom) -> pd.DataFrame:
    if "latitude" not in df.columns or "longitude" not in df.columns:
        return df.copy()

    valid = df.dropna(subset=["latitude", "longitude"]).copy()

    if valid.empty:
        return valid

    def is_inside(row: pd.Series) -> bool:
        pt = Point(float(row["longitude"]), float(row["latitude"]))
        return basin_geom.contains(pt) or basin_geom.touches(pt)

    valid["dentro_bacia"] = valid.apply(is_inside, axis=1)
    return valid[valid["dentro_bacia"]].copy()


def save_outputs(
    env: AreaEnvelope,
    raw_df: pd.DataFrame,
    detail_df: pd.DataFrame | None,
    final_df: pd.DataFrame,
) -> None:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    raw_current = RAW_DIR / "siagas_resultado_area.csv"
    raw_snapshot = RAW_DIR / f"siagas_resultado_area_{timestamp}.csv"
    raw_df.to_csv(raw_current, index=False, encoding="utf-8-sig")
    raw_df.to_csv(raw_snapshot, index=False, encoding="utf-8-sig")

    if detail_df is not None and not detail_df.empty:
        detail_current = RAW_DIR / "siagas_detalhes.csv"
        detail_snapshot = RAW_DIR / f"siagas_detalhes_{timestamp}.csv"
        detail_df.to_csv(detail_current, index=False, encoding="utf-8-sig")
        detail_df.to_csv(detail_snapshot, index=False, encoding="utf-8-sig")

    final_current = PROCESSED_DIR / "pocos_paramirim.csv"
    final_snapshot = PROCESSED_DIR / f"pocos_paramirim_{timestamp}.csv"
    final_df.to_csv(final_current, index=False, encoding="utf-8-sig")
    final_df.to_csv(final_snapshot, index=False, encoding="utf-8-sig")

    metadata = {
        "updated_at_utc": timestamp,
        "envelope": {
            "lat_north": env.lat_north,
            "lat_south": env.lat_south,
            "lon_west": env.lon_west,
            "lon_east": env.lon_east,
        },
        "raw_rows": int(len(raw_df)),
        "detail_rows": int(len(detail_df)) if detail_df is not None else 0,
        "final_rows": int(len(final_df)),
    }

    metadata_path = PROCESSED_DIR / "metadata_atualizacao.json"
    metadata_path.write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def main() -> None:
    print("Lendo arquivo da bacia...")
    geojson = extract_geojson_from_js(SHAPE_FILE)
    basin_geom = build_basin_geometry(geojson)
    envelope = get_envelope(basin_geom)

    print("Montando payload de pesquisa...")
    payload = build_search_payload(envelope)

    print("Consultando SIAGAS...")
    session = make_session()
    html = fetch_search_page(session, payload)

    total_registros = detect_total_registros(html)
    if total_registros is not None:
        print(f"Total indicado pelo SIAGAS: {total_registros}")

    print("Extraindo tabela-resumo...")
    raw_df = parse_result_table(html)
    raw_df["fonte"] = "SIAGAS"
    raw_df["updated_at_utc"] = datetime.now(timezone.utc).isoformat()

    print(f"Linhas capturadas na tabela-resumo: {len(raw_df)}")

    print("Localizando links de detalhe...")
    code_links = extract_detail_links(html)

    detail_df = pd.DataFrame()
    final_df = raw_df.copy()

    if code_links:
        print(f"Links de detalhe encontrados: {len(code_links)}")
        detail_df = fetch_detail_data(session, code_links)

        merged = raw_df.merge(detail_df, on="codigo_ponto", how="left")

        if {"latitude", "longitude"}.issubset(merged.columns):
            filtered = filter_points_in_basin(merged, basin_geom)

            if not filtered.empty:
                print(f"Poços dentro da bacia após filtro espacial: {len(filtered)}")
                final_df = filtered
            else:
                print(
                    "Nenhum poço permaneceu após o filtro espacial. "
                    "Mantendo tabela mesclada sem recorte final."
                )
                final_df = merged
        else:
            final_df = merged
    else:
        print("Nenhum link de detalhe foi encontrado na página de resultados.")

    print("Salvando saídas...")
    save_outputs(envelope, raw_df, detail_df, final_df)

    print("Processo finalizado com sucesso.")


if __name__ == "__main__":
    main()