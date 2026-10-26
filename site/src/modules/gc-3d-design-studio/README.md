# GC 3D Design Studio module

Route `/studio`. Architecture, commands, API, configuration and tests: [docs/3D-STUDIO.md](../../../../docs/3D-STUDIO.md).

`core/` is plain JavaScript with no three.js or React, so the building model, measurements and command validation can be reused by the takeoff and estimating engines and tested with `node --test tests/studio3d.test.mjs`.
