"""全機共用的瀏覽器鎖：任何工作階段要開無頭瀏覽器前先拿鎖，確保同時只有一個瀏覽器檢查在跑"""
import fcntl, os, time
from contextlib import contextmanager

LOCK = os.path.expanduser("~/.cache/seth2_browser.lock")


@contextmanager
def browser_lock(timeout=900):
    os.makedirs(os.path.dirname(LOCK), exist_ok=True)
    f = open(LOCK, "w")
    t0 = time.time()
    while True:
        try:
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
            break
        except BlockingIOError:
            if time.time() - t0 > timeout:
                f.close()
                raise SystemExit("等瀏覽器鎖逾時：另一個工作階段的瀏覽器檢查還在跑")
            time.sleep(1)
    try:
        yield
    finally:
        fcntl.flock(f, fcntl.LOCK_UN)
        f.close()
