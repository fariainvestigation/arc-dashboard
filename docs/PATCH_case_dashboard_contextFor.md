# Patch: stop dropping fields at the source

File: `01_Case_Dashboard.html`

`normalizeCase()` already stores `attorney`, `attorneyFirm`, and `charges`, but
`contextFor()` leaves them out of the published context. Every downstream module
reads them (`attorney` 23 times, `charges` 12, `attorneyFirm` 7, `county` 6), so
they arrive blank and stay blank. This is the largest single source of missing
information in the system, and it is a six-line fix.

## Replace

```js
function contextFor(c){
  if(!c)return null;
  return {caseId:c.caseId,matter:c.matter,docket:c.docket,court:c.court,clientName:c.clientName,
    subjectName:c.subjectName,investigator:c.investigator,status:c.status,incidentDate:c.incidentDate,notes:c.notes};
}
```

## With

```js
function contextFor(c){
  if(!c)return null;
  return {caseId:c.caseId,matter:c.matter,caseName:c.matter,docket:c.docket,docketNumber:c.docket,
    court:c.court,county:c.county||"",clientName:c.clientName,defendantName:c.clientName,
    subjectName:c.subjectName,charges:c.charges,attorney:c.attorney,attorneyFirm:c.attorneyFirm,
    investigator:c.investigator,status:c.status,incidentDate:c.incidentDate,notes:c.notes};
}
```

The alias keys (`caseName`, `docketNumber`, `defendantName`) are included because
different modules read different names for the same value. Publishing both costs
nothing and removes a class of blank fields.

## Also add `county` to the case record

`normalizeCase()` has no `county` field, so it can never be entered. Add it
alongside `court`:

```js
court:text(x.court),county:text(x.county),
```

and add an input to the case form next to Court.

## Load order on every ARC page

```html
<script src="arc_unified_bridge.js"></script>
<script src="arc_case_link.js"></script>
<!-- module scripts after this line -->
```

`arc_case_link.js` must load after the unified bridge (it reads `ARCUnified` at
boot) and before any module that calls `ARCBridge`.
