# Local SAM2 Server (No Replicate)

This server provides the endpoint used by the app:

- `POST http://127.0.0.1:8765/sam2/segment`
- Returns an `image/png` mask
- `POST http://127.0.0.1:8765/sam2/parts`
- Returns JSON with color preview + labeled part regions

## 1) Environment

Use Python 3.10+ in a venv (WSL is recommended on Windows for SAM2).

```powershell
cd tools/sam2-local
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## 2) Install SAM2

Install SAM2 from the official repo into this environment.

```powershell
pip install git+https://github.com/facebookresearch/sam2.git
```

If the above fails for your setup, clone SAM2 manually and run `pip install -e .` in the SAM2 repo.

## 3) Download a checkpoint

Download `sam2.1_hiera_small.pt` and keep a matching config file available.

Recommended location:

```powershell
New-Item -ItemType Directory -Path .\checkpoints -Force | Out-Null
Invoke-WebRequest -Uri "https://huggingface.co/facebook/sam2.1-hiera-small/resolve/main/sam2.1_hiera_small.pt?download=true" -OutFile ".\checkpoints\sam2.1_hiera_small.pt"
```

You usually do **not** need to set `SAM2_CONFIG` manually:
- the server auto-detects the config from the installed `sam2` package.

Optional overrides (only if needed):

```powershell
$env:SAM2_CHECKPOINT="C:\path\to\sam2.1_hiera_small.pt"
$env:SAM2_CONFIG="C:\path\to\sam2.1_hiera_s.yaml"
$env:SAM2_DEVICE="cuda"  # or cpu
```

## 4) Run the server

```powershell
python server.py
```

Or use helper scripts:

- Foreground: `tools\sam2-local\start-server.bat`
- Background: `tools\sam2-local\start-server-background.bat`
- Stop: `tools\sam2-local\stop-server.bat`

The start scripts default to `SAM2_DEVICE=cuda` unless you override it.

Health check:

```powershell
curl http://127.0.0.1:8765/health
```

## 5) App settings

In the app Auto-Rig panel:

- Segmentation provider: `SAM2 (Local Endpoint)`
- Local endpoint: `http://127.0.0.1:8765/sam2/segment`

No Replicate key is required.

## Auto-start with app

`launch.bat` now checks `http://127.0.0.1:8765/health` and auto-starts the SAM2 server in background if needed.

## GPU note

If `/health` reports `"device": "cpu"` and you want GPU acceleration, install a CUDA-enabled PyTorch build in this venv.
