#!/usr/bin/env python3
"""Build `catalog.js` from public star catalogues.

Inputs (cached under .cache/, downloaded from jsDelivr):
  - stars6.json    d3-celestial bright star catalogue (magnitude <= 6, 5044 stars)
  - starnames.json d3-celestial HIP -> designation/proper-name lookup
  - messier.json   d3-celestial Messier catalogue (110 objects)

Output:
  - catalog.js     a plain `<script>` file exposing `window.SKY_CATALOG`.
                   It works from file:// too (no fetch needed).

Usage:
    python3 tools/build_catalog.py
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache"
OUT = ROOT / "catalog.js"

# --- constellation abbreviation -> Chinese name (IAU 88) ---------------------
CON_ZH = {
    "And": "仙女座", "Ant": "唧筒座", "Aps": "天燕座", "Aqr": "宝瓶座", "Aql": "天鹰座",
    "Ara": "天坛座", "Ari": "白羊座", "Aur": "御夫座", "Boo": "牧夫座", "Cae": "雕具座",
    "Cam": "鹿豹座", "Cnc": "巨蟹座", "CVn": "猎犬座", "CMa": "大犬座", "CMi": "小犬座",
    "Cap": "摩羯座", "Car": "船底座", "Cas": "仙后座", "Cen": "半人马座", "Cep": "仙王座",
    "Cet": "鲸鱼座", "Cha": "蝘蜓座", "Cir": "圆规座", "Col": "天鸽座", "Com": "后发座",
    "CrA": "南冕座", "CrB": "北冕座", "Crv": "乌鸦座", "Crt": "巨爵座", "Cru": "南十字座",
    "Cyg": "天鹅座", "Del": "海豚座", "Dor": "剑鱼座", "Dra": "天龙座", "Equ": "小马座",
    "Eri": "波江座", "For": "天炉座", "Gem": "双子座", "Gru": "天鹤座", "Her": "武仙座",
    "Hor": "时钟座", "Hya": "长蛇座", "Hyi": "水蛇座", "Ind": "印第安座", "Lac": "蝎虎座",
    "Leo": "狮子座", "LMi": "小狮座", "Lep": "天兔座", "Lib": "天秤座", "Lup": "豺狼座",
    "Lyn": "天猫座", "Lyr": "天琴座", "Men": "山案座", "Mic": "显微镜座", "Mon": "麒麟座",
    "Mus": "苍蝇座", "Nor": "矩尺座", "Oct": "南极座", "Oph": "蛇夫座", "Ori": "猎户座",
    "Pav": "孔雀座", "Peg": "飞马座", "Per": "英仙座", "Phe": "凤凰座", "Pic": "绘架座",
    "Psc": "双鱼座", "PsA": "南鱼座", "Pup": "船尾座", "Pyx": "罗盘座", "Ret": "网罟座",
    "Sge": "天箭座", "Sgr": "人马座", "Sco": "天蝎座", "Scl": "玉夫座", "Sct": "盾牌座",
    "Ser": "巨蛇座", "Sex": "六分仪座", "Tau": "金牛座", "Tel": "望远镜座", "Tri": "三角座",
    "TrA": "南三角座", "Tuc": "杜鹃座", "UMa": "大熊座", "UMi": "小熊座", "Vel": "船帆座",
    "Vir": "室女座", "Vol": "飞鱼座", "Vul": "狐狸座",
}

# --- English proper name -> Chinese name (curated, well established) --------
STAR_ZH = {
    "Sirius": "天狼星", "Canopus": "老人星", "Arcturus": "大角星", "Rigil Kentaurus": "南门二",
    "Vega": "织女星", "Capella": "五车二", "Rigel": "参宿七", "Procyon": "南河三",
    "Achernar": "水委一", "Betelgeuse": "参宿四", "Hadar": "马腹一", "Altair": "河鼓二",
    "Acrux": "十字架二", "Aldebaran": "毕宿五", "Spica": "角宿一", "Antares": "心宿二",
    "Pollux": "北河三", "Fomalhaut": "北落师门", "Deneb": "天津四", "Mimosa": "十字架三",
    "Toliman": "南门二乙", "Regulus": "轩辕十四", "Adhara": "弧矢七", "Castor": "北河二",
    "Gacrux": "十字架一", "Shaula": "尾宿八", "Bellatrix": "参宿五", "Elnath": "五车五",
    "Miaplacidus": "南船五", "Alnilam": "参宿二", "Alnair": "鹤一", "Alnitak": "参宿一",
    "Regor": "天社一", "Alioth": "玉衡", "Kaus Australis": "箕宿三", "Mirfak": "天船三",
    "Dubhe": "天枢", "Wezen": "弧矢一", "Alkaid": "摇光", "Avior": "海石一",
    "Sargas": "尾宿五", "Menkalinan": "五车三", "Atria": "三角形三", "Alhena": "井宿三",
    "Alsephina": "天社三", "Peacock": "孔雀十一", "Polaris": "勾陈一", "Mirzam": "军市一",
    "Alphard": "星宿一", "Algieba": "轩辕十二", "Hamal": "娄宿三", "Diphda": "土司空",
    "Nunki": "斗宿四", "Menkent": "库楼三", "Alpheratz": "壁宿二", "Kochab": "北极二",
    "Mirach": "奎宿九", "Saiph": "参宿六", "Tiaki": "鹤二", "Rasalhague": "侯",
    "Algol": "大陵五", "Almach": "天大将军一", "Denebola": "五帝座一", "Navi": "王良三",
    "Muhlifain": "库楼七", "Aspidiske": "海石二", "Naos": "弧矢增二十二", "Alphecca": "贯索四",
    "Mizar": "开阳", "Sadr": "天津一", "Suhail": "天记", "Eltanin": "天棓四",
    "Shedar": "王良四", "Mintaka": "参宿三", "Caph": "王良一", "Dschubba": "房宿三",
    "Larawag": "尾宿二", "Merak": "天璇", "Izar": "梗河一", "Enif": "危宿三",
    "Ankaa": "火鸟六", "Phecda": "天玑", "Scheat": "室宿二", "Alderamin": "天钩五",
    "Aludra": "弧矢二", "Markab": "室宿一", "Menkar": "天囷一", "Acrab": "房宿四",
    "Zosma": "西上相", "Arneb": "厕一", "Gienah": "轸宿一", "Ascella": "斗宿六",
    "Zubeneschamali": "氐宿四", "Sheratan": "娄宿一", "Kraz": "轸宿四", "Phact": "丈人一",
    "Ruchbah": "阁道三", "Muphrid": "右摄提一", "Hassaleh": "五车一", "Lesath": "尾宿九",
    "Tarazed": "河鼓三", "Porrima": "东上相", "Cursa": "玉井三", "Rasalgethi": "帝座",
    "Rastaban": "天棓三", "Alcyone": "昴宿六", "Vindemiatrix": "东次将", "Deneb Algedi": "垒壁阵四",
    "Cor Caroli": "常陈一", "Fawaris": "天津二", "Algenib": "壁宿一", "Markeb": "天社五",
    "Aljanah": "天津九", "Alnair_Cen": "库楼一", "Wei": "尾宿三", "Unukalhai": "天市右垣七",
}

# --- Messier number -> Chinese name -----------------------------------------
MESSIER_ZH = {
    "M1": "蟹状星云", "M4": "球状星团", "M6": "蝴蝶星团", "M7": "托勒密星团", "M8": "礁湖星云",
    "M11": "野鸭星团", "M13": "武仙座大球状星团", "M16": "鹰状星云", "M17": "欧米伽星云",
    "M20": "三叶星云", "M27": "哑铃星云", "M31": "仙女星系", "M32": "仙女座伴星系",
    "M33": "三角座星系", "M42": "猎户座大星云", "M43": "德梅兰星云", "M44": "蜂巢星团",
    "M45": "昴星团", "M51": "涡状星系", "M57": "环状星云", "M63": "向日葵星系",
    "M64": "黑眼星系", "M76": "小哑铃星云", "M78": "猎户座反射星云", "M81": "波德星系",
    "M82": "雪茄星系", "M83": "南风车星系", "M87": "室女座A", "M97": "猫头鹰星云",
    "M101": "风车星系", "M104": "草帽星系", "M110": "仙女座伴星系", "M15": "球状星团",
    "M22": "球状星团", "M5": "球状星团", "M3": "球状星团", "M2": "球状星团",
}

# --- Messier type code -> Chinese category ----------------------------------
TYPE_ZH = {
    "gc": "球状星团", "oc": "疏散星团", "s": "旋涡星系", "e": "椭圆星系",
    "i": "不规则星系", "sfr": "发射星云", "rn": "反射星云", "pn": "行星状星云",
    "snr": "超新星遗迹", "pos": "星群", "dbl": "双星", "n": "星云",
    "gcl": "球状星团", "ocl": "疏散星团", "gal": "星系",
}


def load(name: str):
    with (CACHE / name).open(encoding="utf-8") as fh:
        return json.load(fh)


def clean(value: str) -> str:
    """Strip the U+2009 thin-space padding d3-celestial uses."""
    return (value or "").replace("\u2009", "").strip()


def norm_ra(ra: float) -> float:
    """d3-celestial stores right ascension in -180..180; normalise to 0..360."""
    return ra % 360


def star_label(meta: dict) -> tuple[str, str]:
    """Return (display label, ascii alias)."""
    proper = clean(meta.get("name"))
    con = CON_ZH.get(clean(meta.get("c")), "")
    if proper and proper in STAR_ZH:
        return STAR_ZH[proper], proper
    if proper:
        return f"{proper}（{con}）" if con else proper, proper
    bayer = clean(meta.get("bayer"))
    if bayer and con:
        return f"{con}{bayer}", ""
    flam = clean(meta.get("flam"))
    if flam and con:
        return f"{con}{flam}", ""
    var = clean(meta.get("var"))
    if var and con:
        return f"{con}{var}", ""
    hip = clean(meta.get("hip"))
    return (hip or "未知恒星"), ""


def build_stars() -> list[list]:
    stars = load("stars6.json")
    names = load("starnames.json")
    out = []
    for feature in stars["features"]:
        hip = str(feature.get("id", ""))
        meta = names.get(hip, {})
        ra, dec = feature["geometry"]["coordinates"]
        mag = feature["properties"].get("mag")
        label, alias = star_label(meta)
        row = [round(norm_ra(float(ra)), 3), round(float(dec), 3), round(float(mag), 2), label]
        if alias and alias != label:
            row.append(alias)
        out.append(row)
    out.sort(key=lambda r: r[2])
    return out


def build_deep_sky() -> list[dict]:
    messier = load("messier.json")
    out = []
    for feature in messier["features"]:
        props = feature["properties"]
        mid = feature["id"]
        ra, dec = feature["geometry"]["coordinates"]
        alt = (props.get("alt") or "").strip()
        cat = TYPE_ZH.get((props.get("type") or "").strip(), "深空天体")
        zh = MESSIER_ZH.get(mid, cat)
        entry = {
            "n": mid,
            "label": f"{zh}（{mid}）" if zh != cat else f"{mid} · {cat}",
            "en": alt or props.get("desig", ""),
            "t": cat,
            "mag": props.get("mag"),
            "ra": round(norm_ra(float(ra)), 3),
            "dec": round(float(dec), 3),
        }
        if zh != cat:
            entry["zh"] = zh
        out.append(entry)
    return out


def main() -> None:
    stars = build_stars()
    deep = build_deep_sky()
    payload = {"stars": stars, "deepSky": deep}
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    OUT.write_text(
        "/* Generated by tools/build_catalog.py - do not edit by hand. */\n"
        "window.SKY_CATALOG = " + body + ";\n",
        encoding="utf-8",
    )
    size_kb = OUT.stat().st_size / 1024
    print(f"wrote {OUT.name}: {len(stars)} stars, {len(deep)} deep-sky objects, {size_kb:.0f} KB")


if __name__ == "__main__":
    main()
