import os
import shutil
import sys
from datetime import datetime

DASHBOARD_PATH = r"C:\Users\Softthrone\Claude\Dashboard"
ARCHIVE_DATE = datetime.now().strftime("%Y-%m-%d")
ARCHIVE_NAME = f"__archive_{ARCHIVE_DATE}"
ARCHIVE_PATH = os.path.join(DASHBOARD_PATH, ARCHIVE_NAME)

PRODUCTION_CORE = {
    "index_ws.html", "midas-theme.css", "MIDAS_Orchestrator.js",
    "vault-sync.js", "midas-memory-policy.js", "midas-proxy.js",
    "MIDAS_Gateway_Server.js", "MIDAS_Bridge_Route.js",
    "package.json", "package-lock.json", ".env", ".gitignore",
    "MIDAS-Start.bat", "MIDAS-Stop.bat", "LICENSE",
}

DOCUMENTATION_KEEP = {
    "PROJECT_MISSION.md", "VALIDATION_WORKFLOW.md", "README_v0_4.md",
    "MIDAS_INTEGRATION_COMPLETE.md", "MIDAS_DASHBOARD_INTEGRATION.md",
    "MRE_Server_Contract.md", "DEBUG_MIDAS.md", "index.html",
    "MIDAS_QuantLab_Chart_Dependency_Note.md", "CHANGELOG_v0_4.md",
}

DEPRECATED_FILES = {
    "START_MIDAS.bat", "START_MIDAS.md", "start-midas.js",
    "launch_dashboard.js", "secure_proxy.js", "MRE_Server.py",
    "README.md", "SYSTEM_BLUEPRINT.md",
}

CHART_LIB_PATTERN = "lightweight-charts"

def validate_path():
    if not os.path.isdir(DASHBOARD_PATH):
        print(f"DASHBOARD_PATH not found: {DASHBOARD_PATH}")
        sys.exit(1)
    print(f"OK Dashboard folder found: {DASHBOARD_PATH}")

def list_files():
    return sorted([f for f in os.listdir(DASHBOARD_PATH) if os.path.isfile(os.path.join(DASHBOARD_PATH, f))])

def find_chart_lib_duplicates():
    files = []
    for item in os.listdir(DASHBOARD_PATH):
        if CHART_LIB_PATTERN in item.lower() and item not in PRODUCTION_CORE:
            full_path = os.path.join(DASHBOARD_PATH, item)
            if os.path.isfile(full_path):
                files.append((item, os.path.getmtime(full_path)))
    
    if len(files) <= 1:
        return [], []
    files.sort(key=lambda x: x[1], reverse=True)
    return [files[0][0]], [f[0] for f in files[1:]]

def categorize_files(all_files):
    keep = []
    archive = list(DEPRECATED_FILES)
    unknown = []
    
    keep_chart, archive_chart = find_chart_lib_duplicates()
    if keep_chart:
        PRODUCTION_CORE.update(keep_chart)
    archive.extend(archive_chart)
    
    for f in all_files:
        if f == ARCHIVE_NAME:
            continue
        elif f in PRODUCTION_CORE or f in DOCUMENTATION_KEEP:
            keep.append(f)
        elif f in archive:
            pass
        else:
            unknown.append(f)
    
    return keep, archive, unknown, keep_chart, archive_chart

def move_file(src, dst_folder):
    try:
        os.makedirs(dst_folder, exist_ok=True)
        shutil.move(src, os.path.join(dst_folder, os.path.basename(src)))
        print(f"  -> {os.path.basename(src)}")
        return True
    except Exception as e:
        print(f"  ERR {os.path.basename(src)}: {e}")
        return False

def run_cleanup():
    print("\n" + "="*80)
    print("MIDAS DASHBOARD CLEANUP")
    print("="*80)
    
    validate_path()
    all_files = list_files()
    print(f"\nFound {len(all_files)} files\n")
    
    keep, archive, unknown, keep_chart, archive_chart = categorize_files(all_files)
    
    if keep_chart or archive_chart:
        print("Chart library dedup:")
        if keep_chart:
            print(f"  Keep:   {keep_chart[0]}")
        if archive_chart:
            for f in archive_chart:
                print(f"  Archive: {f}")
    
    print(f"\nCATEGORIZATION:")
    print(f"  Production Core:      {len([f for f in keep if f in PRODUCTION_CORE])} files")
    print(f"  Active Documentation: {len([f for f in keep if f in DOCUMENTATION_KEEP])} files")
    print(f"  Deprecated:           {len(archive)} files")
    print(f"  Unknown:              {len(unknown)} files")
    
    total_keep = len(keep)
    total_archive = len(archive)
    
    if keep:
        print(f"\nFiles to KEEP ({total_keep}):")
        for f in sorted(keep):
            print(f"  {f}")
    
    if archive:
        print(f"\nFiles to ARCHIVE ({total_archive}):")
        for f in sorted(archive):
            print(f"  {f}")
    
    if unknown:
        print(f"\nUnknown ({len(unknown)} - will preserve):")
        for f in sorted(unknown):
            print(f"  {f}")
    
    print("\n" + "="*80)
    print(f"This will:")
    print(f"  Keep {total_keep} files (production + docs)")
    print(f"  Move {total_archive} files to {ARCHIVE_NAME}/")
    print(f"  Preserve {len(unknown)} unknown files")
    print(f"\nNo files deleted - all reversible.")
    
    response = input("\nProceed? (yes/no): ").strip().lower()
    if response not in ["yes", "y"]:
        print("Cancelled.")
        sys.exit(0)
    
    print(f"\nMoving {total_archive} files...\n")
    moved = 0
    failed = 0
    
    for f in sorted(archive):
        src = os.path.join(DASHBOARD_PATH, f)
        if os.path.exists(src):
            if move_file(src, ARCHIVE_PATH):
                moved += 1
            else:
                failed += 1
    
    print("\n" + "="*80)
    if failed == 0:
        print(f"SUCCESS: {moved} files moved to {ARCHIVE_NAME}/")
        print(f"         {total_keep} files preserved")
        print(f"\nReady for: npm install + MIDAS-Start.bat")
    else:
        print(f"PARTIAL: {moved} moved, {failed} failed")
    print("="*80 + "\n")

if __name__ == "__main__":
    try:
        run_cleanup()
    except KeyboardInterrupt:
        print("\n\nCancelled by user")
        sys.exit(0)
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)