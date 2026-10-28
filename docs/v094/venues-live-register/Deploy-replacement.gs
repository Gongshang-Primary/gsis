// DEPLOY Apps Script: REPLACE the existing venuesDeploySource_ function.
// Uses existing v0.9.4 helpers. Does not write to any spreadsheet.
function venuesDeploySource_(envelope) {
  gsisRequireBackendRole_('deploy');
  var input = venuesSourceReadInput_(venuesSourceAuthenticate_(envelope, 'deploy'), ['versionId', 'commit']);
  // This manual hotfix targets the Apps Script source transport diagnosed at
  // the school. Never silently read a legacy index after edge cutover.
  if (typeof deployEdgeFenced_ === 'function' && deployEdgeFenced_()) {
    venuesSourceError_(503, 'VENUES_SOURCE_SETUP', 'This live-register hotfix requires Apps Script Deploy authority; update the Worker adapter before using it after edge cutover.');
  }
  var b = book_();
  var publications = venuesDeployPublications_(b, index_(b));
  var references = publications.map(function(p) { return p.reference; });
  // LANDMARK_SHEET_ID -> Venues is the physical-room authority.
  // The existing reader validates headers, units, formulas and duplicates.
  var registry = readLandmarkRegistry_();
  if (!registry || !Array.isArray(registry.venues) || !registry.venues.length) {
    venuesSourceError_(503, 'VENUES_SOURCE_INVALID', 'The live Venues register is empty or unavailable.');
  }
  var key = venuesSourceHash_({publications: references, physicalRooms: registry.venues});
  if (input.operation === 'manifest') {
    return venuesSourceResult_('deploy', key, input, {publications: references});
  }
  var selected = publications.find(function(p) {
    return p.reference.versionId === input.versionId && p.reference.commit === input.commit;
  });
  if (!selected || input.expectedKey !== key) {
    venuesSourceError_(409, 'VENUES_SOURCE_CHANGED', 'Deploy publications or the live Venues register changed. Refresh before trying again.');
  }
  var venues = registry.venues.map(function(v) {
    var unit = String(v.unitNumber || '').trim();
    return {
      sourceId: 'deploy:' + selected.reference.versionId + ':' + unit,
      unit: unit,
      name: String(v.name || unit),
      shortName: String(v.shortName || ''),
      aliases: Array.from(new Set([unit, v.geometryUnit, v.name, v.shortName].filter(Boolean).map(String))),
      capacity: Number(v.capacity) || 0
    };
  });
  if (venues.some(function(v) { return !v.unit; }) || new Set(venues.map(function(v) { return v.unit; })).size !== venues.length) {
    venuesSourceError_(503, 'VENUES_SOURCE_INVALID', 'The live Venues register contains missing or duplicate units.');
  }
  var afterReferences = venuesDeployPublications_(b, index_(b)).map(function(p) { return p.reference; });
  var afterRegistry = readLandmarkRegistry_();
  if (venuesSourceHash_({publications: afterReferences, physicalRooms: afterRegistry.venues}) !== key) {
    venuesSourceError_(409, 'VENUES_SOURCE_CHANGED', 'Deploy publications or the live Venues register changed during refresh. Retry.');
  }
  return venuesSourceResult_('deploy', key, input, {publication: selected.reference, venues: venues});
}
