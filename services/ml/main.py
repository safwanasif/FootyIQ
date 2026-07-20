"""
============================================================================
FootyIQ ML Service – Environment Verification Script
============================================================================
PURPOSE:
    Verifies that the Python virtual environment is correctly set up by
    importing key dependencies and printing their versions.

USAGE:
    python main.py

EXPECTED OUTPUT:
    ✓ pandas version: X.X.X
    ✓ statsbombpy version: X.X.X
    ✓ scikit-learn version: X.X.X
    ✓ torch version: X.X.X
    ✓ fastapi version: X.X.X
    ✓ uvicorn version: X.X.X
    
    Setup verified!
============================================================================
"""

def verify_environment():
    """Import core dependencies and print versions."""
    
    print("\n" + "=" * 70)
    print("FootyIQ ML Service – Environment Verification")
    print("=" * 70 + "\n")
    
    # Dictionary of (package_name, import_name, description)
    packages = [
        ("pandas", "pandas", "Data processing & ETL"),
        ("statsbombpy", "statsbombpy", "StatsBomb data acquisition"),
        ("scikit-learn", "sklearn", "ML model training"),
        ("torch", "torch", "Deep learning framework"),
        ("fastapi", "fastapi", "REST API framework"),
        ("uvicorn", "uvicorn", "ASGI server"),
    ]
    
    failed = []
    
    for package_name, import_name, description in packages:
        try:
            module = __import__(import_name)
            version = getattr(module, "__version__", "unknown")
            print(f"  ✓ {package_name:20} (v{version:10}) – {description}")
        except ImportError as e:
            print(f"  ✗ {package_name:20} – FAILED: {e}")
            failed.append(package_name)
    
    print("\n" + "=" * 70)
    
    if failed:
        print(f"\n⚠️  SETUP INCOMPLETE – Missing: {', '.join(failed)}")
        print("   Run: pip install -r requirements.txt")
        return False
    else:
        print("\n✓ Setup verified! All dependencies installed and importable.")
        print("   Ready to start Phase 1 ETL development.\n")
        return True

if __name__ == "__main__":
    success = verify_environment()
    exit(0 if success else 1)