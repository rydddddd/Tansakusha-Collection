// Executed only on an explicit import click, in a ccfolia.com tab.
// Read only the single most recently copied character, never room/account data.
async function readLastCopiedCcfoliaCharacter() {
    return new Promise((resolve) => {
        let db;
        let finished = false;
        const finish = (result) => {
            if (finished)
                return;
            finished = true;
            clearTimeout(timer);
            if (db)
                db.close();
            resolve(result);
        };
        const timer = setTimeout(() => finish({ error: "読み取りがタイムアウトしました。部屋を再読み込みしてコマをコピーし直してください。" }), 5000);
        const request = indexedDB.open("character-entries");
        request.onupgradeneeded = () => {
            request.transaction.abort(); // Do not create a database on an unused profile.
            finish({ error: "コピーしたコマがありません。部屋でコマを右クリックしてコピーしてください。" });
        };
        request.onerror = () => finish({ error: "コマの保存データを開けませんでした。もう一度コピーしてください。" });
        request.onblocked = () => finish({ error: "ココフォリアの部屋を再読み込みしてからお試しください。" });
        request.onsuccess = () => {
            db = request.result;
            if (finished) {
                db.close();
                return;
            }
            if (!db.objectStoreNames.contains("character")) {
                finish({ error: "コマの保存形式に対応していません。" });
                return;
            }
            const transaction = db.transaction("character", "readonly");
            const store = transaction.objectStore("character");
            transaction.onerror = () => finish({ error: "コマの読み取りに失敗しました。" });
            transaction.onabort = () => finish({ error: "コマの読み取りが中断されました。" });
            const count = store.count();
            count.onsuccess = () => {
                if (count.result !== 1) {
                    finish({ error: "コピーしたコマを特定できません。取り込みたいコマをもう一度コピーしてください。" });
                    return;
                }
                const cursor = store.openCursor();
                cursor.onsuccess = () => {
                    var _a, _b;
                    const data = (_b = (_a = cursor.result) === null || _a === void 0 ? void 0 : _a.value) === null || _b === void 0 ? void 0 : _b.copyData;
                    if (!data || typeof data.name !== "string") {
                        finish({ error: "コマの保存形式に対応していません。" });
                        return;
                    }
                    const allowed = ["name", "memo", "initiative", "externalUrl", "status", "params", "iconUrl", "color", "commands"];
                    const clean = {};
                    for (const key of allowed)
                        if (data[key] !== undefined)
                            clean[key] = data[key];
                    finish({ data: clean });
                };
            };
        };
    });
}
async function importCopiedCcfolia(edition) {
    var _a, _b;
    setBusy(true);
    setMessage("コピーしたコマを確認中…");
    try {
        const tabs = await chrome.tabs.query({ url: "https://ccfolia.com/*" });
        if (!tabs.length)
            throw new Error("同じChromeプロフィールでココフォリアの部屋を開き、コマをコピーしてください。別ウィンドウでも大丈夫です。");
        if (!((_a = chrome.scripting) === null || _a === void 0 ? void 0 : _a.executeScript))
            throw new Error("拡張機能の管理画面でCollectionの再読み込み（↻）を押し、このページも更新してください。");
        const tab = tabs.find((item) => { var _a; return (_a = item.url) === null || _a === void 0 ? void 0 : _a.includes("/rooms/"); }) || tabs[0];
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: readLastCopiedCcfoliaCharacter
        });
        const result = (_b = results[0]) === null || _b === void 0 ? void 0 : _b.result;
        if (!(result === null || result === void 0 ? void 0 : result.data))
            throw new Error((result === null || result === void 0 ? void 0 : result.error) || "コマを読み取れませんでした。");
        if (!confirm(`最後にコピーしたコマ「${result.data.name || "（名前なし）"}」を${edition === "6th" ? "6版" : "7版"}として追加 / 更新しますか？\n違うコマならキャンセルしてコピーし直してください。`)) {
            setMessage("取り込みをキャンセルしました。");
            return;
        }
        await importPawnText(JSON.stringify({ kind: "character", data: result.data }), { edition, ccfolia: true });
    }
    catch (error) {
        setMessage(`取り込めませんでした：${error.message || error}`, "error");
    }
    finally {
        setBusy(false);
    }
}
