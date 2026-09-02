---
"Preflight Alternate Routes workflow": minor
---
- **Discover Routes and Print** — optional scope: all routes, explicit namespaces, or namespaces derived from selected OpenShift apps.
- **Alternate Routes** — replaces “Discover Routes and Add Alternative Route”; enables **Alt Routes Workflow** with:
  - Print Alternate Routes
  - Add Alternate Route (suffix, labels, force replace)
  - Add Ingress with Route (ingress controller name + router label)

Legacy exports using `discover_routes_alt` are migrated to `alternate_routes` on import.
