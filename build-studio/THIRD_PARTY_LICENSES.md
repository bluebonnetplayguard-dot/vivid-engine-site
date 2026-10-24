# Third-party licenses: Vivid Build Studio

Build Studio is our own design and code. We use only open-source libraries whose licenses allow commercial use.

**Status key**
- **Verified:** the license was read from the installed package's own metadata.
- **To verify:** check the library's LICENSE file before it ships. These libraries weren't installable in the build environment.

## Used now

| Library | Version | Used for | License | Status |
|---|---|---|---|---|
| ReportLab (open-source toolkit) | 5.0.1 | Vector PDF sheets at exact scale | BSD | Verified |
| jsonschema | 4.26.0 | Model Spec validation | MIT | Verified |
| pdfplumber | 0.11.10 | Scale test: reads line lengths back from the PDF (tests only) | MIT | Verified |
| pdfminer.six | 20260107 | Dependency of pdfplumber (tests only) | MIT | Verified |
| three.js | r128 (cdnjs) | 3D viewer | MIT | To verify |
| Montserrat, DM Sans (Google Fonts) | | Viewer typography | SIL Open Font License 1.1 | To verify |

## Planned (server geometry service and exports)

| Library | Used for | License (expected) | Notes |
|---|---|---|---|
| build123d | B-rep modeling API (`occt_backend.py`) | Apache-2.0 | To verify |
| OCP / OpenCascade Technology (OCCT) | Kernel: booleans, STEP, hidden-line removal | LGPL-2.1 with OCCT exception | Use as a dynamically linked library, unmodified. Keep its license notice. |
| FastAPI | Geometry service API (`app.py`) | MIT | To verify |
| ezdxf | DXF export | MIT | To verify |
| IfcOpenShell | IFC export (server) | LGPL-3.0 | Use as a separate library. Keep its license notice. |
| web-ifc | IFC in the browser (option) | MPL-2.0 | To verify |
| Manifold | Fast browser previews (option) | Apache-2.0 | To verify |
| BullMQ | Job queue | MIT | To verify |

**Not used:** no other product's code, file formats, UI, icons or text. CNC formats such as BTL are only an interface, until their spec license is confirmed.
