#!/usr/bin/env python3
"""
Build data/pollsters.csv for the Truth in Polling page.

Downloads the pollster workbook as .xlsx (one tab per country; the tab is named after the country or its
ISO-2 code), stacks every tab into one table with a "Tab" column, and keeps only the PUBLIC columns below.
Header names may vary a little between tabs ("Membership:" / "Memberships", "Accuracy" /
"Accuracy / total error" …): they are matched through ALIASES.
The sheet ID comes from the POLLSTER_SHEET_ID environment variable (a repository secret), so it never
appears in the public repository or on the page.

Usage:  POLLSTER_SHEET_ID=... python3 scripts/build_data.py site/data/pollsters.csv
        python3 scripts/build_data.py site/data/pollsters.csv --xlsx local-copy.xlsx   (offline test)
"""
import csv, io, os, re, sys, urllib.request
from openpyxl import load_workbook

# Published columns (canonical names) and the header spellings that map to them.
# Never published: "Other" and any column not listed here.
ALIASES = {
    "Pollster name": ["pollster name", "pollster", "name"],
    "Registration year": ["registration year", "founded", "year of registration"],
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
SKIP_TABS = {"template", "readme", "instructions", "overview", "index", "lists"}


def norm(s):
    s = " ".join(str(s or "").split()).strip().lower()
    return re.sub(r"[:\s]+$", "", s)  # "Pollster name:" -> "pollster name"


def cell(v):
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).strip()


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "site/data/pollsters.csv"
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
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    with open(out, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=["Tab"] + PUBLIC)
        w.writeheader()
        w.writerows(rows)
    print(f"{len(rows)} pollsters from {tabs} country tabs -> {out}")


if __name__ == "__main__":
    main()
