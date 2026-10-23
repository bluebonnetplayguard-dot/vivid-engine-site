WINDOWS ASSET GENERATOR

The reported CommandNotFoundException happens before image processing:
the temporary path to make-assets.ps1 does not point to an existing script.
This version does not depend on that temporary session folder.

1. Save make-assets.ps1 and run-assets.cmd together in a permanent folder.
2. Create an images folder beside them containing the original 1.webp logo
   and 2.webp banner. The banner must be at least 2000 x 744 pixels.
3. Double-click run-assets.cmd. Generated assets appear in the output folder.
   Existing generated files with the same names are overwritten.

The launcher uses Windows PowerShell in STA mode. It applies an execution-policy
bypass only to that process and does not change the saved Windows policy.

If Windows cannot decode WebP, add matching 1.png and 2.png copies beside the
originals, or install ImageMagick so magick.exe is available on PATH.
No software is installed automatically.

Advanced: make-assets.ps1 also accepts -ImgDir and -Out for custom folders.
This package generates images only; it does not change the website or server.
It was authored here but has not been executed on Windows.
