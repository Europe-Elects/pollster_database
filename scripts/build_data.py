#!/usr/bin/env python3
"""
Build data/pollsters.csv for the Truth in Polling page.

Downloads the pollster workbook as .xlsx (one tab per country; the tab is named after the country or its
ISO-2 code), stacks every tab into one table with a "Tab" column, and keeps only the PUBLIC columns below.
Header names may vary a little between tabs ("Membership:" / "Memberships", "Accuracy" /
"Accuracy / total error" …): they are matched through ALIASES.
The sheet ID comes from the POLLSTER_SHEET_ID environment variable (a repository secret), so it never
appears in the public repository or on the page.

Usage:  python3 scripts/build_data.py site/data/pollsters.csv --csv data/eetip-summary.csv   (public summary CSV)
        POLLSTER_SHEET_ID=... python3 scripts/build_data.py site/data/pollsters.csv           (Google Sheet)
        python3 scripts/build_data.py site/data/pollsters.csv --xlsx local-copy.xlsx           (offline test)

The summary CSV has one row per pollster and the country in its first column ("Country ID").
"""
import csv, io, os, re, sys, urllib.request
from openpyxl import load_workbook

# Published columns (canonical names) and the header spellings that map to them.
# Never published: "Other" and any column not listed here.
ALIASES = {
    "Pollster name": ["pollster name", "pollster", "name"],
    "Registration year": ["registration year", "registration", "founded", "year of registration"],
    "Methodology": ["methodology", "methods"],
    "Key people": ["key people", "people"],
    "Accuracy": ["accuracy", "accuracy / total error", "total error"],
    "Potential conflict of interest": ["potential conflict of interest", "conflict of interest", "potential conflicts of interest"],
    "Membership": ["membership", "memberships"],
    "Website": ["website", "web"],
    "Note": ["note", "notes"],
    "Coverage": ["present in the europe elects polling coverage", "present in the europe elects polling coverage (yes/no)", "europe elects coverage", "in coverage"],
    "Reference": ["reference", "reference (e.g., on social media)"],
    "Presence / Experience": ["presence / experience", "presence", "experience"],
    "Notable commissioners": ["selection of notable past commissioners", "notable past commissioners", "commissioners", "clients"],
    # Contact details: already public on the previous Truth in Polling page. Delete these two lines to stop publishing them.
    "Address": ["address", "addresses", "postal address"],
    "Email address": ["email address", "email addresses", "e-mail address", "e-mail addresses", "email", "e-mail"],
}
PUBLIC = list(ALIASES)
LOOKUP = {a: canon for canon, al in ALIASES.items() for a in al}
TAB_HEADERS = {"country id", "country", "tab"}  # country column of the summary CSV
SKIP_TABS = {"template", "readme", "instructions", "overview", "index", "lists", "calculations", "calculation", "summary", "sources", "data"}  # helper tabs


def norm(s):
    s = " ".join(str(s or "").split()).strip().lower()
    return re.sub(r"[:\s]+$", "", s)  # "Pollster name:" -> "pollster name"


def cell(v):
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).strip()


def from_csv(path):
    """Rows from the one-table summary CSV (country in the "Country ID" column)."""
    with open(path, encoding="utf-8-sig", newline="") as fh:
        rd = csv.reader(fh)
        head = next(rd)
        idx, tab = {}, None
        for i, h in enumerate(head):
            if norm(h) in TAB_HEADERS and tab is None:
                tab = i
            canon = LOOKUP.get(norm(h))
            if canon and canon not in idx:
                idx[canon] = i
        if tab is None or "Pollster name" not in idx:
            sys.exit("The CSV needs a country column (Country ID) and a pollster name column (Name)")
        rows = []
        for r in rd:
            get = lambda c: cell(r[idx[c]]) if c in idx and idx[c] < len(r) else ""
            country = cell(r[tab]) if tab < len(r) else ""
            if not get("Pollster name") or not country or norm(country) in SKIP_TABS:
                continue
            rows.append({"Tab": country, **{c: get(c) for c in PUBLIC}})
    return rows, len({r["Tab"] for r in rows})


def write(out, rows, tabs):
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    with open(out, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=["Tab"] + PUBLIC)
        w.writeheader()
        w.writerows(rows)
    print(f"{len(rows)} pollsters from {tabs} countries -> {out}")


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "site/data/pollsters.csv"
    if "--csv" in sys.argv:
        return write(out, *from_csv(sys.argv[sys.argv.index("--csv") + 1]))
    if "--xlsx" in sys.argv:
        data = open(sys.argv[sys.argv.index("--xlsx") + 1], "rb").read()
    else:
        sid = os.environ.get("POLLSTER_SHEET_ID", "").strip()
        if not sid:
            sys.exit("POLLSTER_SHEET_ID is not set")
        req = urllib.request.Request(f"https://docs.google.com/spreadsheets/d/{sid}/export?format=xlsx", headers={"User-Agent": "Mozilla/5.0"})
        data = urllib.request.urlopen(req, timeout=120).read()
    wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    rows, tabs = [], 0
    for ws in wb.worksheets:
        if ws.sheet_state != "visible" or norm(ws.title) in SKIP_TABS:
            continue
        it = ws.iter_rows(values_only=True)
        idx = None
        for r in it:  # header = first row with a "Pollster name" cell
            if any(LOOKUP.get(norm(v)) == "Pollster name" for v in r):
                idx = {}
                for i, v in enumerate(r):
                    canon = LOOKUP.get(norm(v))
                    if canon and canon not in idx:
                        idx[canon] = i
                break
        if not idx:
            continue
        tabs += 1
        for r in it:
            get = lambda c: cell(r[idx[c]]) if c in idx and idx[c] < len(r) else ""
            if not get("Pollster name"):
                continue
            rows.append({"Tab": ws.title.strip(), **{c: get(c) for c in PUBLIC}})
    write(out, rows, tabs)


if __name__ == "__main__":
    main()
