# ParaPo

Ground-truthed jeepney routes for Metro Manila, on a map anyone can open.

- **The map:** https://parapo.villaralvorovic2.workers.dev
- **How it is built, and what comes next:** [PLAN.md](PLAN.md)

## Data and licence

**The code** is under the [MIT licence](LICENSE): use it for anything, keep
the copyright notice.

**The route and hotspot data** — `public/data/map.json`, and the database it
is published from — is under the
[Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/)
(ODbL). You may copy, use and adapt it, including commercially, as long as
you:

1. **Credit it:** "Route data © ParaPo contributors, ODbL", and OpenStreetMap
   for the roads it follows.
2. **Share alike:** if you publish an adapted version of the data, publish it
   under the ODbL too.
3. **Keep it open:** do not wrap it in technical restrictions that stop
   others doing the same.

The route lines follow OpenStreetMap's road network (snapped with OSRM), so
the data is a derivative of OpenStreetMap, © OpenStreetMap contributors, also
under the ODbL. The map tiles come from OpenFreeMap, built from the same data.

Every published version of the map file is kept in this repository's history,
so what is published stays public.
