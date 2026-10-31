# Truth in Polling

Europe Elects' database of pollsters as an interactive page, in the same style as the Party Atlas. It is hosted on GitHub Pages and rebuilt every day from the Google Sheet (one tab per country).

## What's in it

- **Introduction and warnings**, with links to the methodology report and the data tables.
- **Map**: pollsters per country, with Crimea shown as part of Ukraine and Cyprus as one country. Click a country to jump to it.
- **One profile per pollster, grouped by country**:
  - founding year;
  - data-collection modes as icons (telephone, face-to-face, online, paper, automated calls, mixed mode);
  - sample size and margin of error, read from the methodology text;
  - key people;
  - the accuracy review, the website, and expandable details: methodology, conflict of interest, notes, memberships, contact.
- **Name struck through in red**: the pollster isn't in Europe Elects' polling coverage.
- **Yellow warning sign**: a potential conflict of interest is documented. "Not identified", "None" and similar entries don't trigger it.
- **Filters**: search, country, in our coverage only, conflicts of interest only.
- **Bottom of the page**: legal disclaimer, rights and preferred citation (expandable), plus partners and funders.

## What is published

`scripts/build_data.py` reads these columns, whatever their exact spelling ("Membership:" or "Memberships", "Accuracy" or "Accuracy / total error" …):
- Pollster name, Registration year, Methodology, Key people, Accuracy, Potential conflict of interest, Membership, Website, Note;
- Present in the Europe Elects polling coverage, Reference, Presence / Experience, Notable commissioners;
- Address and Email address.

Address and Email address are published because they were public on the previous Truth in Polling page. Delete their two lines in `ALIASES` to stop publishing them. "Other", and any column not listed, is never published.

Tabs are read when their name is a country name (e.g. `Germany`) or an ISO-2 code (e.g. `DE`), and they contain a "Pollster name" header. Hidden tabs and helper tabs (Template, Readme…) are skipped.

## Set up

1. Create the repository `Europe-Elects/truth-in-polling`, or another name, and upload these files, including the `.github/workflows` and `scripts` folders.
2. **Settings → Secrets and variables → Actions → New repository secret**:
   - name: `POLLSTER_SHEET_ID`
   - value: `15JEb1nz0I1Xj0ZYvBAg8tcHWZRloQF3b6Kn5HRg38ZM`

   This keeps the sheet's address out of the public code.
3. **Settings → Pages → Source: GitHub Actions**.
4. **Actions → Refresh data & deploy → Run workflow**.

The Google Sheet must be viewable by "anyone with the link", so the workflow can download it.

## WordPress embed

```html
<iframe id="ee-pollsters" title="Truth in Polling – Europe Elects" src="https://europe-elects.github.io/truth-in-polling/" scrolling="no" style="width:0;min-width:100%;border:0" height="2400"></iframe>
<script>
window.addEventListener("message",function(e){var d=e.data&&e.data["datawrapper-height"];if(!d)return;document.querySelectorAll("iframe").forEach(function(f){if(f.contentWindow===e.source)for(var k in d)f.style.height=d[k]+"px"})});
</script>
```
