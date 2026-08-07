from pathlib import Path
from bs4 import BeautifulSoup
import json, re, sys
root=Path(__file__).resolve().parents[1]
errors=[]
for name in ["index.html","profile.html","add-person.html","review.html"]:
 p=root/name
 if not p.exists(): errors.append(f"missing {name}"); continue
 html=p.read_text()
 soup=BeautifulSoup(html,"lxml")
 if not soup.title or not soup.title.text.strip(): errors.append(f"{name}: missing title")
 ids=[x.get("id") for x in soup.find_all(attrs={"id":True})]
 dup={x for x in ids if ids.count(x)>1}
 if dup: errors.append(f"{name}: duplicate ids {sorted(dup)}")
 for tag in soup.find_all(["script","link"]):
  ref=tag.get("src") or tag.get("href")
  if ref and not re.match(r"https?://|#|mailto:|tel:",ref):
   target=(p.parent/ref).resolve()
   if not target.exists(): errors.append(f"{name}: missing asset {ref}")
for f in (root/"prompts").glob("*.txt"):
 if not f.read_text().strip(): errors.append(f"empty prompt {f.name}")
json.loads((root/"schemas"/"people-extraction.schema.json").read_text())
json.loads((root/"schemas"/"sample-extraction.demo.json").read_text())
if errors:
 print("FAIL")
 print("\n".join(errors));sys.exit(1)
print("PASS: static structure, assets, IDs, prompt files, and JSON files validated.")
