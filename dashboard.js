const STORAGE_KEY = "charaenoSorterCharactersV2";
const SORT_KEY = "charaenoSorterSortKeyV2";
const STATUS_VISIBLE_KEY = "charaenoSorterStatusVisibleV1";
const SKILL_VISIBLE_KEY = "charaenoSorterSkillVisibleV1";
const EDITION_FILTER_KEY = "charaenoSorterEditionFilterV1";
const IMAGE_DB_NAME = "charaenoCharacterImageCacheV1";
const IMAGE_STORE_NAME = "images";
const IMAGE_DB_VERSION = 1;
const DEFAULT_COLOR = "#6F9E7A";
const STAT_ORDER = ["STR", "CON", "POW", "DEX", "APP", "SIZ", "INT", "EDU", "HP", "MP", "SAN", "幸運", "アイデア", "知識", "BLD", "MOV"];
const CARD_PRIMARY_STATS = ["STR", "CON", "POW", "DEX", "APP", "SIZ", "INT", "EDU", "HP", "MP"];
const CARD_DERIVED_STATS_6TH = ["SAN", "幸運", "アイデア", "知識", "DB"];
const CARD_DERIVED_STATS_7TH = ["SAN", "幸運", "DB", "BLD", "MOV"];
const ui = {
    charaenoUrlInput: document.getElementById("charaenoUrlInput"),
    charaenoUrlAddBtn: document.getElementById("charaenoUrlAddBtn"),
    jsonInput: document.getElementById("jsonInput"),
    json6Btn: document.getElementById("json6Btn"),
    json7Btn: document.getElementById("json7Btn"),
    message: document.getElementById("message"),
    nameSearchInput: document.getElementById("nameSearchInput"),
    nameSearchToggle: document.getElementById("nameSearchToggle"),
    nameSearchMenu: document.getElementById("nameSearchMenu"),
    sortInput: document.getElementById("sortInput"),
    sortDatalist: document.getElementById("sortDatalist"),
    statusToggleBtn: document.getElementById("statusToggleBtn"),
    skillToggleBtn: document.getElementById("skillToggleBtn"),
    cards: document.getElementById("cards"),
    emptyState: document.getElementById("emptyState"),
    countValue: document.getElementById("countValue"),
    cardTemplate: document.getElementById("cardTemplate"),
    tabAll: document.getElementById("tabAll"),
    tab6th: document.getElementById("tab6th"),
    tab7th: document.getElementById("tab7th"),
    backupExportBtn: document.getElementById("backupExportBtn"),
    backupImportBtn: document.getElementById("backupImportBtn"),
    backupFileInput: document.getElementById("backupFileInput")
};
let characters = [];
let sortKeys = ["skill:目星"];
let statusVisible = true;
let skillVisible = true;
let editionFilter = "all";
let nameQuery = "";
let nameMenuOpen = false;
let sortChoices = [];
const activeObjectUrls = new Set();
init().catch((error) => {
    console.error(error);
    setMessage("初期化に失敗しました。拡張機能を読み込み直してください。", "error");
});
async function init() {
    const saved = await chrome.storage.local.get([STORAGE_KEY, SORT_KEY, STATUS_VISIBLE_KEY, SKILL_VISIBLE_KEY, EDITION_FILTER_KEY]);
    characters = Array.isArray(saved[STORAGE_KEY]) ? saved[STORAGE_KEY].map(migrateCharacter) : [];
    sortKeys = deserializeSortKeys(saved[SORT_KEY]);
    statusVisible = typeof saved[STATUS_VISIBLE_KEY] === "boolean" ? saved[STATUS_VISIBLE_KEY] : true;
    skillVisible = typeof saved[SKILL_VISIBLE_KEY] === "boolean" ? saved[SKILL_VISIBLE_KEY] : true;
    editionFilter = ["all", "6th", "7th"].includes(saved[EDITION_FILTER_KEY]) ? saved[EDITION_FILTER_KEY] : "all";
    bindEvents();
    renderAll();
    void warmImageCacheForCharacters();
}
function bindEvents() {
    ui.charaenoUrlAddBtn.addEventListener("click", importCharaenoFromUrl);
    ui.charaenoUrlInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            importCharaenoFromUrl();
        }
    });
    ui.json6Btn.addEventListener("click", () => importPawnText(ui.jsonInput.value, { clearInput: true, edition: "6th" }));
    ui.json7Btn.addEventListener("click", () => importPawnText(ui.jsonInput.value, { clearInput: true, edition: "7th" }));
    document.getElementById("ccfolia6Btn").addEventListener("click", () => importCopiedCcfolia("6th"));
    document.getElementById("ccfolia7Btn").addEventListener("click", () => importCopiedCcfolia("7th"));
    ui.nameSearchInput.addEventListener("input", () => {
        nameQuery = ui.nameSearchInput.value;
        nameMenuOpen = true;
        updateNameSearchMenu();
        renderCards();
    });
    ui.nameSearchInput.addEventListener("focus", () => {
        nameMenuOpen = true;
        updateNameSearchMenu();
    });
    ui.nameSearchInput.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            nameMenuOpen = false;
            updateNameSearchMenu();
            ui.nameSearchInput.blur();
        }
        else if (event.key === "Enter") {
            event.preventDefault();
            const matches = getNameSearchCandidates();
            if (matches.length === 1) {
                chooseNameSearchCandidate(matches[0]);
            }
        }
    });
    ui.nameSearchInput.addEventListener("search", () => {
        nameQuery = ui.nameSearchInput.value;
        updateNameSearchMenu();
        renderCards();
    });
    ui.nameSearchToggle.addEventListener("click", (event) => {
        event.stopPropagation();
        nameMenuOpen = !nameMenuOpen;
        updateNameSearchMenu();
        if (nameMenuOpen)
            ui.nameSearchInput.focus();
    });
    document.addEventListener("click", (event) => {
        if (!event.target.closest(".name-search-wrap")) {
            nameMenuOpen = false;
            updateNameSearchMenu();
        }
    });
    ui.sortInput.addEventListener("focus", () => {
        requestAnimationFrame(() => ui.sortInput.select());
    });
    ui.sortInput.addEventListener("pointerdown", (event) => {
        const rect = ui.sortInput.getBoundingClientRect();
        const arrowZone = 46;
        const clickedArrow = event.clientX >= rect.right - arrowZone;
        const currentLabel = sortLabel(sortKeys);
        if (clickedArrow && ui.sortInput.value === currentLabel)
            ui.sortInput.value = "";
    });
    ui.sortInput.addEventListener("click", () => {
        const currentLabel = sortLabel(sortKeys);
        if (ui.sortInput.value === currentLabel)
            ui.sortInput.select();
    });
    ui.sortInput.addEventListener("input", () => { });
    ui.sortInput.addEventListener("change", () => {
        const choices = parseSortQuery(ui.sortInput.value, true);
        if (choices)
            applySortChoices(choices);
    });
    ui.sortInput.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown" && ui.sortInput.value === sortLabel(sortKeys)) {
            ui.sortInput.value = "";
            return;
        }
        if (event.key === "Escape") {
            ui.sortInput.value = sortLabel(sortKeys);
            ui.sortInput.select();
            return;
        }
        if (event.key !== "Enter")
            return;
        event.preventDefault();
        const choices = parseSortQuery(ui.sortInput.value, true);
        if (choices)
            applySortChoices(choices);
        else
            setMessage(`「${ui.sortInput.value.trim()}」に一致する技能・能力値がありません。複数指定は「APP 聞き耳」のようにスペースで区切ってください。`, "error");
    });
    ui.statusToggleBtn.addEventListener("click", async () => {
        statusVisible = !statusVisible;
        await chrome.storage.local.set({ [STATUS_VISIBLE_KEY]: statusVisible });
        updateStatusToggle();
        renderCards();
    });
    ui.skillToggleBtn.addEventListener("click", async () => {
        skillVisible = !skillVisible;
        await chrome.storage.local.set({ [SKILL_VISIBLE_KEY]: skillVisible });
        updateSkillToggle();
        renderCards();
    });
    ui.tabAll.addEventListener("click", () => setEditionFilter("all"));
    ui.tab6th.addEventListener("click", () => setEditionFilter("6th"));
    ui.tab7th.addEventListener("click", () => setEditionFilter("7th"));
    ui.backupExportBtn.addEventListener("click", exportBackup);
    ui.backupImportBtn.addEventListener("click", () => ui.backupFileInput.click());
    ui.backupFileInput.addEventListener("change", handleBackupFileSelected);
}
function openImageDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(IMAGE_DB_NAME, IMAGE_DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(IMAGE_STORE_NAME)) {
                db.createObjectStore(IMAGE_STORE_NAME, { keyPath: "key" });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("画像キャッシュを開けませんでした"));
    });
}
async function getCachedImageRecord(key) {
    if (!key)
        return null;
    const db = await openImageDb();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(IMAGE_STORE_NAME, "readonly");
            const request = tx.objectStore(IMAGE_STORE_NAME).get(key);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error || new Error("画像キャッシュを読めませんでした"));
        });
    }
    finally {
        db.close();
    }
}
async function putCachedImageRecord(record) {
    const db = await openImageDb();
    try {
        await new Promise((resolve, reject) => {
            const tx = db.transaction(IMAGE_STORE_NAME, "readwrite");
            tx.objectStore(IMAGE_STORE_NAME).put(record);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error("画像キャッシュを保存できませんでした"));
            tx.onabort = () => reject(tx.error || new Error("画像キャッシュの保存が中断されました"));
        });
    }
    finally {
        db.close();
    }
}
async function deleteCachedImage(key) {
    if (!key)
        return;
    const db = await openImageDb();
    try {
        await new Promise((resolve, reject) => {
            const tx = db.transaction(IMAGE_STORE_NAME, "readwrite");
            tx.objectStore(IMAGE_STORE_NAME).delete(key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error("画像キャッシュを削除できませんでした"));
        });
    }
    finally {
        db.close();
    }
}
async function getAllCachedImageRecords() {
    const db = await openImageDb();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(IMAGE_STORE_NAME, "readonly");
            const request = tx.objectStore(IMAGE_STORE_NAME).getAll();
            request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
            request.onerror = () => reject(request.error || new Error("画像キャッシュ一覧を読めませんでした"));
        });
    }
    finally {
        db.close();
    }
}
async function clearAllCachedImages() {
    const db = await openImageDb();
    try {
        await new Promise((resolve, reject) => {
            const tx = db.transaction(IMAGE_STORE_NAME, "readwrite");
            tx.objectStore(IMAGE_STORE_NAME).clear();
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error("画像キャッシュを初期化できませんでした"));
            tx.onabort = () => reject(tx.error || new Error("画像キャッシュの初期化が中断されました"));
        });
    }
    finally {
        db.close();
    }
}
function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("画像をバックアップ形式へ変換できませんでした"));
        reader.readAsDataURL(blob);
    });
}
function dataUrlToBlob(dataUrl) {
    const match = String(dataUrl || "").match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
    if (!match)
        throw new Error("バックアップ内の画像データが不正です");
    const type = match[1] || "application/octet-stream";
    const isBase64 = Boolean(match[2]);
    const body = match[3] || "";
    if (isBase64) {
        const binary = atob(body);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++)
            bytes[i] = binary.charCodeAt(i);
        return new Blob([bytes], { type });
    }
    return new Blob([decodeURIComponent(body)], { type });
}
async function exportBackup() {
    setBusy(true);
    setMessage("バックアップを作成中…");
    try {
        const storage = await chrome.storage.local.get([
            STORAGE_KEY,
            SORT_KEY,
            STATUS_VISIBLE_KEY,
            SKILL_VISIBLE_KEY,
            EDITION_FILTER_KEY
        ]);
        const cachedImages = await getAllCachedImageRecords();
        const images = [];
        for (const record of cachedImages) {
            if (!((record === null || record === void 0 ? void 0 : record.blob) instanceof Blob) || !(record === null || record === void 0 ? void 0 : record.key))
                continue;
            images.push({
                key: record.key,
                sourceUrl: record.sourceUrl || "",
                updatedAt: record.updatedAt || 0,
                dataUrl: await blobToDataUrl(record.blob)
            });
        }
        const payload = {
            format: "tansakusha-collection-backup",
            formatVersion: 1,
            appVersion: chrome.runtime.getManifest().version,
            exportedAt: new Date().toISOString(),
            storage,
            images
        };
        const json = JSON.stringify(payload);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        a.href = url;
        a.download = `Tansakusha-Collection-backup-${stamp}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setMessage(`バックアップを保存しました（探索者${characters.length}人・画像${images.length}件）。`, "ok");
    }
    catch (error) {
        console.error(error);
        setMessage(`バックアップ保存に失敗しました：${humanizeError(error)}`, "error");
    }
    finally {
        setBusy(false);
    }
}
async function handleBackupFileSelected(event) {
    var _a, _b;
    const file = (_a = event.target.files) === null || _a === void 0 ? void 0 : _a[0];
    event.target.value = "";
    if (!file)
        return;
    setBusy(true);
    setMessage("バックアップを読み込み中…");
    try {
        const payload = JSON.parse(await file.text());
        if ((payload === null || payload === void 0 ? void 0 : payload.format) !== "tansakusha-collection-backup" || (payload === null || payload === void 0 ? void 0 : payload.formatVersion) !== 1) {
            throw new Error("Tansakusha Collectionのバックアップファイルではありません");
        }
        const storage = payload.storage;
        if (!storage || typeof storage !== "object" || !Array.isArray(storage[STORAGE_KEY])) {
            throw new Error("バックアップ内の探索者データが不正です");
        }
        const ok = confirm(`このバックアップを復元します。

探索者：${storage[STORAGE_KEY].length}人
画像：${Array.isArray(payload.images) ? payload.images.length : 0}件

現在の探索者一覧と画像キャッシュはバックアップ内容で置き換わります。続けますか？`);
        if (!ok) {
            setMessage("バックアップの読み込みをキャンセルしました。");
            return;
        }
        await chrome.storage.local.set({
            [STORAGE_KEY]: storage[STORAGE_KEY],
            [SORT_KEY]: (_b = storage[SORT_KEY]) !== null && _b !== void 0 ? _b : "skill:目星",
            [STATUS_VISIBLE_KEY]: typeof storage[STATUS_VISIBLE_KEY] === "boolean" ? storage[STATUS_VISIBLE_KEY] : true,
            [SKILL_VISIBLE_KEY]: typeof storage[SKILL_VISIBLE_KEY] === "boolean" ? storage[SKILL_VISIBLE_KEY] : true,
            [EDITION_FILTER_KEY]: ["all", "6th", "7th"].includes(storage[EDITION_FILTER_KEY]) ? storage[EDITION_FILTER_KEY] : "all"
        });
        await clearAllCachedImages();
        for (const item of (Array.isArray(payload.images) ? payload.images : [])) {
            if (!(item === null || item === void 0 ? void 0 : item.key) || !(item === null || item === void 0 ? void 0 : item.dataUrl))
                continue;
            const blob = dataUrlToBlob(item.dataUrl);
            if (!blob.type.startsWith("image/"))
                continue;
            await putCachedImageRecord({
                key: item.key,
                sourceUrl: item.sourceUrl || "",
                updatedAt: item.updatedAt || Date.now(),
                blob
            });
        }
        const saved = await chrome.storage.local.get([STORAGE_KEY, SORT_KEY, STATUS_VISIBLE_KEY, SKILL_VISIBLE_KEY, EDITION_FILTER_KEY]);
        characters = Array.isArray(saved[STORAGE_KEY]) ? saved[STORAGE_KEY].map(migrateCharacter) : [];
        sortKeys = deserializeSortKeys(saved[SORT_KEY]);
        statusVisible = typeof saved[STATUS_VISIBLE_KEY] === "boolean" ? saved[STATUS_VISIBLE_KEY] : true;
        skillVisible = typeof saved[SKILL_VISIBLE_KEY] === "boolean" ? saved[SKILL_VISIBLE_KEY] : true;
        editionFilter = ["all", "6th", "7th"].includes(saved[EDITION_FILTER_KEY]) ? saved[EDITION_FILTER_KEY] : "all";
        releaseObjectUrls();
        renderAll();
        setMessage(`バックアップを復元しました（探索者${characters.length}人）。`, "ok");
    }
    catch (error) {
        console.error(error);
        setMessage(`バックアップ読み込みに失敗しました：${humanizeError(error)}`, "error");
    }
    finally {
        setBusy(false);
    }
}
async function resizeImageBlob(blob) {
    if (!(blob instanceof Blob) || !blob.type.startsWith("image/"))
        return blob;
    if (/image\/(gif|svg\+xml)/i.test(blob.type))
        return blob;
    try {
        const bitmap = await createImageBitmap(blob);
        const maxWidth = 480;
        const maxHeight = 640;
        const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height);
        if (scale >= 1 && blob.size <= 700000) {
            bitmap.close();
            return blob;
        }
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext("2d", { alpha: true });
        ctx.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();
        return await canvas.convertToBlob({ type: "image/webp", quality: 0.86 });
    }
    catch (error) {
        console.warn("画像の縮小に失敗したため元画像を保存します", error);
        return blob;
    }
}
async function cacheImageForCharacter(character, options = {}) {
    const sourceUrl = firstString(character === null || character === void 0 ? void 0 : character.image);
    if (!sourceUrl)
        return false;
    const key = characterIdentity(character);
    if (!key)
        return false;
    const existing = await getCachedImageRecord(key).catch(() => null);
    if (!options.force && (existing === null || existing === void 0 ? void 0 : existing.blob) instanceof Blob && existing.sourceUrl === sourceUrl)
        return true;
    try {
        const response = await fetch(sourceUrl, { cache: "no-store" });
        if (!response.ok)
            throw new Error(`画像 ${response.status}`);
        const contentType = response.headers.get("content-type") || "";
        if (contentType && !contentType.startsWith("image/"))
            throw new Error("画像形式ではありません");
        let blob = await response.blob();
        if (!blob.type.startsWith("image/"))
            throw new Error("画像データを取得できませんでした");
        blob = await resizeImageBlob(blob);
        await putCachedImageRecord({ key, sourceUrl, blob, updatedAt: Date.now() });
        return true;
    }
    catch (error) {
        // 画像キャッシュ失敗は表示本体を壊さないため、静かに外部画像表示へフォールバックする。
        return false;
    }
}
async function warmImageCacheForCharacters() {
    for (const character of characters) {
        if (!(character === null || character === void 0 ? void 0 : character.image))
            continue;
        await cacheImageForCharacter(character);
    }
}
function releaseObjectUrls() {
    for (const url of activeObjectUrls)
        URL.revokeObjectURL(url);
    activeObjectUrls.clear();
}
async function applyPortraitImage(img, fallback, character) {
    const key = characterIdentity(character);
    const cached = await getCachedImageRecord(key).catch(() => null);
    if ((cached === null || cached === void 0 ? void 0 : cached.blob) instanceof Blob) {
        const objectUrl = URL.createObjectURL(cached.blob);
        activeObjectUrls.add(objectUrl);
        img.src = objectUrl;
        img.hidden = false;
        fallback.style.display = "none";
        return;
    }
    if (character.image) {
        img.src = character.image;
        img.hidden = false;
        fallback.style.display = "grid";
        void cacheImageForCharacter(character);
    }
    else {
        img.hidden = true;
        fallback.style.display = "grid";
    }
}
function parseCharaenoUrl(input) {
    if (!input)
        return null;
    let u;
    try {
        u = new URL(String(input).trim());
    }
    catch {
        return null;
    }
    const host = u.hostname.toLowerCase();
    if (host !== "charaeno.com")
        return null;
    const match = u.pathname.match(/^\/(6th|7th)\/([^/?#]+)/i);
    if (!match)
        return null;
    const edition = match[1].toLowerCase();
    const id = match[2];
    return {
        edition,
        id,
        origin: `${u.protocol}//${u.host}`,
        url: `${u.protocol}//${u.host}/${edition}/${id}`
    };
}
async function importCharaenoFromUrl() {
    const parsed = parseCharaenoUrl(ui.charaenoUrlInput.value);
    if (!parsed) {
        setMessage("Charaenoの6版または7版キャラシURLを貼ってください。", "error");
        return;
    }
    setBusy(true);
    setMessage("Charaenoから読み込み中…");
    try {
        const fresh = await fetchAndNormalizeCharaenoCharacter(parsed);
        const index = findExistingCharacterIndex(fresh);
        if (index >= 0) {
            characters[index] = mergeCharaenoCharacter(fresh, characters[index]);
            await saveCharacters();
            if (characters[index].image)
                void cacheImageForCharacter(characters[index], { force: true });
            else
                void deleteCachedImage(characterIdentity(characters[index]));
            renderAll();
            setMessage(`${characters[index].name} を更新しました。`, "ok");
        }
        else {
            characters.push(fresh);
            await saveCharacters();
            if (fresh.image)
                void cacheImageForCharacter(fresh, { force: true });
            renderAll();
            setMessage(`${fresh.name} を追加しました。`, "ok");
        }
        ui.charaenoUrlInput.value = "";
    }
    catch (error) {
        console.error(error);
        setMessage(`Charaenoの読み込みに失敗しました：${humanizeError(error)}`, "error");
    }
    finally {
        setBusy(false);
    }
}
async function fetchAndNormalizeCharaenoCharacter(parsed) {
    if (!parsed)
        throw new Error("URL形式が不正です");
    const apiCandidates = [
        `${parsed.origin}/api/v1/${parsed.edition}/${parsed.id}/summary`,
        `${parsed.origin}/api/v1/${parsed.edition}/${parsed.id}`
    ];
    let raw = null;
    let lastError = null;
    for (const apiUrl of apiCandidates) {
        try {
            const response = await fetch(apiUrl, { cache: "no-store" });
            if (!response.ok)
                throw new Error(`API ${response.status}`);
            const contentType = response.headers.get("content-type") || "";
            if (!contentType.includes("json"))
                throw new Error("APIがJSONを返しませんでした");
            raw = await response.json();
            if (raw)
                break;
        }
        catch (error) {
            lastError = error;
        }
    }
    let html = "";
    try {
        const pageResponse = await fetch(parsed.url, { cache: "no-store" });
        if (pageResponse.ok)
            html = await pageResponse.text();
    }
    catch (error) {
        console.warn("Charaeno page HTML fetch failed", error);
    }
    if (!raw)
        raw = extractEmbeddedDataFromHtml(html);
    if (!raw)
        throw lastError || new Error("探索者データを取得できませんでした");
    const character = normalizeCharaenoCharacter(raw, parsed, html);
    if (!character.name || Object.keys(character.skills).length === 0) {
        const fallback = parseRenderedHtml(html);
        character.name || (character.name = fallback.name);
        character.occupation || (character.occupation = fallback.occupation);
        character.characteristics = { ...fallback.characteristics, ...character.characteristics };
        character.skills = { ...fallback.skills, ...character.skills };
    }
    if (!character.name)
        throw new Error("探索者名を読み取れませんでした");
    if (!Object.keys(character.skills).length && !Object.keys(character.characteristics).length) {
        throw new Error("技能・能力値を読み取れませんでした");
    }
    return character;
}
function normalizeCharaenoCharacter(input, parsed, html) {
    var _a, _b, _c, _d, _e, _f;
    const raw = unwrapData(input);
    const rawName = firstString(raw === null || raw === void 0 ? void 0 : raw.name, (_a = raw === null || raw === void 0 ? void 0 : raw.character) === null || _a === void 0 ? void 0 : _a.name, (_b = raw === null || raw === void 0 ? void 0 : raw.profile) === null || _b === void 0 ? void 0 : _b.name, input === null || input === void 0 ? void 0 : input.name, (_c = input === null || input === void 0 ? void 0 : input.data) === null || _c === void 0 ? void 0 : _c.name) || "";
    const split = splitNameAndRuby(rawName);
    const characteristics = {};
    collectCharacteristics(raw, characteristics);
    collectCharacteristics(input, characteristics);
    const extras = {};
    collectTextStats(raw, extras);
    collectTextStats(input, extras);
    const skills = {};
    collectSkills(raw, skills);
    collectSkills(input, skills);
    collectCommands((raw === null || raw === void 0 ? void 0 : raw.commands) || (raw === null || raw === void 0 ? void 0 : raw.chatpalette) || (input === null || input === void 0 ? void 0 : input.commands) || (input === null || input === void 0 ? void 0 : input.chatpalette) || ((_d = input === null || input === void 0 ? void 0 : input.data) === null || _d === void 0 ? void 0 : _d.commands) || ((_e = input === null || input === void 0 ? void 0 : input.data) === null || _e === void 0 ? void 0 : _e.chatpalette), skills, characteristics);
    const image = findImageUrl(input, parsed.url) || findImageUrl(raw, parsed.url) || findImageInHtml(html, parsed.url) || "";
    const occupation = firstString(raw === null || raw === void 0 ? void 0 : raw.occupation, raw === null || raw === void 0 ? void 0 : raw.job, raw === null || raw === void 0 ? void 0 : raw.profession, input === null || input === void 0 ? void 0 : input.occupation, (_f = input === null || input === void 0 ? void 0 : input.data) === null || _f === void 0 ? void 0 : _f.occupation) || "";
    // Charaeno custom convention: a skill such as
    // 「芸術（文字色 00ADA9）」 can declare the character card color.
    const declaredColor = extractDeclaredTextColor(skills, raw, input, html);
    return {
        id: `charaeno:${parsed.id}`,
        source: "charaeno",
        sourceLabel: "Charaeno",
        importOrigin: "charsheet",
        nameSource: "charsheet",
        imageSource: image ? "charsheet" : "",
        colorSource: declaredColor ? "charsheet" : "",
        hasImportedColor: Boolean(declaredColor),
        sanEdited: false,
        edition: parsed.edition,
        editionEdited: false,
        url: parsed.url,
        name: split.name || rawName,
        ruby: split.ruby,
        occupation,
        color: declaredColor || DEFAULT_COLOR,
        colorEdited: false,
        image,
        characteristics,
        extras,
        skills,
        nameEdited: false,
        rubyEdited: false,
        statusMasked: false,
        skillMasked: false,
        updatedAt: Date.now()
    };
}
function mergeCharaenoCharacter(fresh, old) {
    return mergeCharacterRecords(fresh, old, { origin: "charsheet" });
}
function unwrapData(input) {
    let cur = input;
    for (let i = 0; i < 3; i++) {
        if (!cur || typeof cur !== "object")
            break;
        if (cur.kind === "character" && cur.data && typeof cur.data === "object")
            cur = cur.data;
        else if (cur.result && typeof cur.result === "object")
            cur = cur.result;
        else if (cur.character && cur.character.name && typeof cur.character === "object")
            cur = cur.character;
        else
            break;
    }
    return cur || {};
}
async function importPawnText(text, options = {}) {
    const forcedEdition = options.edition;
    if (!["6th", "7th"].includes(forcedEdition)) {
        setMessage("6版か7版のどちらかを選んで追加してください。", "error");
        return;
    }
    const raw = String(text || "").trim();
    if (!raw) {
        setMessage("ココフォリア駒JSONが空です。", "error");
        return;
    }
    setBusy(true);
    try {
        const payloads = parseJsonPayloads(raw);
        if (!payloads.length)
            throw new Error("JSONを読み取れませんでした");
        let added = 0;
        let updated = 0;
        const rejected = [];
        const touchedCharacters = [];
        for (const payload of payloads) {
            try {
                const fresh = normalizePawnCharacter(payload, forcedEdition, options.ccfolia);
                const index = findExistingCharacterIndex(fresh);
                if (index >= 0) {
                    characters[index] = mergeImportedCharacter(fresh, characters[index], { origin: options.ccfolia ? "ccfolia" : "charsheet" });
                    touchedCharacters.push(characters[index]);
                    updated++;
                }
                else {
                    characters.push(fresh);
                    touchedCharacters.push(fresh);
                    added++;
                }
            }
            catch (error) {
                rejected.push(String((error === null || error === void 0 ? void 0 : error.message) || error));
            }
        }
        if (!added && !updated) {
            throw new Error(rejected[0] || "対応しているキャラクターを読み取れませんでした");
        }
        await saveCharacters();
        for (const character of touchedCharacters)
            void cacheImageForCharacter(character, { force: true });
        if (options.clearInput)
            ui.jsonInput.value = "";
        renderAll();
        const parts = [];
        if (added)
            parts.push(`${added}人追加`);
        if (updated)
            parts.push(`${updated}人更新`);
        if (rejected.length)
            parts.push(`${rejected.length}件スキップ`);
        setMessage(`${parts.join("、")}しました。`, rejected.length ? "error" : "ok");
    }
    catch (error) {
        console.error(error);
        setMessage(`読み込みに失敗しました：${humanizeError(error)}`, "error");
    }
    finally {
        setBusy(false);
    }
}
function parseJsonPayloads(text) {
    const source = String(text || "").trim();
    if (!source)
        return [];
    try {
        const parsed = JSON.parse(source);
        return Array.isArray(parsed) ? parsed : [parsed];
    }
    catch { }
    // コピペ時に {}{} と同じJSONが連続してしまっても拾えるようにする。
    const results = [];
    let depth = 0;
    let start = -1;
    let inString = false;
    let escaped = false;
    for (let i = 0; i < source.length; i++) {
        const ch = source[i];
        if (inString) {
            if (escaped)
                escaped = false;
            else if (ch === "\\")
                escaped = true;
            else if (ch === '"')
                inString = false;
            continue;
        }
        if (ch === '"') {
            inString = true;
            continue;
        }
        if (ch === "{") {
            if (depth === 0)
                start = i;
            depth++;
        }
        else if (ch === "}") {
            depth--;
            if (depth === 0 && start >= 0) {
                const chunk = source.slice(start, i + 1);
                try {
                    results.push(JSON.parse(chunk));
                }
                catch { }
                start = -1;
            }
        }
    }
    return results;
}
function normalizePawnCharacter(input, forcedEdition, fromCcfolia = false) {
    if (!input || typeof input !== "object")
        throw new Error("駒JSONの形式が不正です");
    const data = input.kind === "character" && input.data && typeof input.data === "object" ? input.data : (input.data || input);
    const rawName = firstString(data.name, input.name) || "";
    const split = splitNameAndRuby(rawName);
    const rawUrl = firstString(data.externalUrl, input.externalUrl);
    let sourceInfo = detectSupportedSource(rawUrl);
    if (!fromCcfolia && (!sourceInfo || sourceInfo.source !== "iachara"))
        throw new Error("いあきゃらのココフォリア駒JSONを使ってください。Charaenoは上のURL欄から登録します");
    if (!sourceInfo) {
        let safeUrl = "";
        try {
            const u = new URL(rawUrl);
            if (["https:", "http:"].includes(u.protocol))
                safeUrl = u.href;
        }
        catch { }
        sourceInfo = { source: "ccfolia", label: "ココフォリア", url: safeUrl,
            characterId: safeUrl || JSON.stringify([rawName, firstString(data.iconUrl)]) };
    }
    const characteristics = {};
    collectCharacteristics(data, characteristics);
    collectCharacteristics(input, characteristics);
    const extras = {};
    collectTextStats(data, extras);
    collectTextStats(input, extras);
    const skills = {};
    collectSkills(data, skills);
    collectSkills(input, skills);
    const commands = firstString(data.commands, input.commands, data.chatpalette, input.chatpalette) || "";
    collectCommands(commands, skills, characteristics);
    const importedColor = normalizeHex(data.color || input.color);
    const color = importedColor || DEFAULT_COLOR;
    const image = firstString(data.iconUrl, input.iconUrl) || "";
    const importOrigin = fromCcfolia ? "ccfolia" : "charsheet";
    const edition = ["6th", "7th"].includes(forcedEdition) ? forcedEdition : "";
    if (!split.name)
        throw new Error("探索者名を読み取れませんでした");
    if (!fromCcfolia && !Object.keys(skills).length && !Object.keys(characteristics).length)
        throw new Error(`${split.name} の技能・能力値を読み取れませんでした`);
    return {
        id: `${sourceInfo.source}:${sourceInfo.characterId || sourceInfo.url}`,
        source: sourceInfo.source,
        sourceLabel: sourceInfo.label,
        importOrigin,
        nameSource: importOrigin,
        imageSource: image ? importOrigin : "",
        colorSource: importedColor ? importOrigin : "",
        hasImportedColor: Boolean(importedColor),
        sanEdited: false,
        edition,
        editionEdited: true,
        url: sourceInfo.url,
        name: split.name || rawName,
        ruby: split.ruby,
        occupation: "",
        color,
        colorEdited: false,
        image,
        characteristics,
        extras,
        skills,
        nameEdited: false,
        rubyEdited: false,
        statusMasked: false,
        skillMasked: false,
        updatedAt: Date.now()
    };
}
function detectSupportedSource(rawUrl) {
    if (!rawUrl)
        return null;
    let u;
    try {
        u = new URL(rawUrl);
    }
    catch {
        return null;
    }
    const host = u.hostname.toLowerCase();
    if (host === "charaeno.com" || host.endsWith(".charaeno.com")) {
        const m = u.pathname.match(/^\/(6th|7th)\/([^/?#]+)/i);
        if (!m)
            return null;
        return {
            source: "charaeno",
            label: "Charaeno",
            edition: m[1].toLowerCase(),
            characterId: m[2],
            url: `${u.protocol}//${u.host}/${m[1].toLowerCase()}/${m[2]}`
        };
    }
    if (host === "iachara.com" || host.endsWith(".iachara.com")) {
        const m = u.pathname.match(/^\/(?:view|edit)\/([^/?#]+)/i);
        if (!m)
            return null;
        return {
            source: "iachara",
            label: "いあきゃら",
            edition: "",
            characterId: m[1],
            url: `https://iachara.com/view/${m[1]}`
        };
    }
    return null;
}
function characterIdentity(character) {
    const info = detectSupportedSource(character === null || character === void 0 ? void 0 : character.url);
    if (info)
        return `${info.source}:${info.characterId}`;
    return (character === null || character === void 0 ? void 0 : character.id) || `${(character === null || character === void 0 ? void 0 : character.source) || "unknown"}:${(character === null || character === void 0 ? void 0 : character.url) || (character === null || character === void 0 ? void 0 : character.name) || ""}`;
}
function normalizeExplorerName(name) {
    return splitNameAndRuby(String(name || "")).name
        .normalize("NFKC")
        .replace(/[\s　]+/g, "")
        .toLowerCase();
}
function findExistingCharacterIndex(fresh) {
    const freshIdentity = characterIdentity(fresh);
    let index = characters.findIndex((c) => characterIdentity(c) === freshIdentity);
    if (index >= 0)
        return index;
    const freshInfo = detectSupportedSource(fresh === null || fresh === void 0 ? void 0 : fresh.url);
    if (freshInfo) {
        index = characters.findIndex((c) => {
            const info = detectSupportedSource(c === null || c === void 0 ? void 0 : c.url);
            return info && info.source === freshInfo.source && info.characterId === freshInfo.characterId;
        });
        if (index >= 0)
            return index;
    }
    // URLのないココフォリア駒でも、同名・同版が一人だけなら既存探索者へ統合する。
    // 同名が複数いる場合は誤統合を避けて別カードにする。
    const targetName = normalizeExplorerName(fresh === null || fresh === void 0 ? void 0 : fresh.name);
    if (!targetName)
        return -1;
    const freshIsCcfolia = (fresh === null || fresh === void 0 ? void 0 : fresh.importOrigin) === "ccfolia" || (fresh === null || fresh === void 0 ? void 0 : fresh.source) === "ccfolia";
    const candidates = characters
        .map((character, candidateIndex) => ({ character, candidateIndex }))
        .filter(({ character }) => {
        const sameName = normalizeExplorerName(character === null || character === void 0 ? void 0 : character.name) === targetName;
        const sameEdition = !(fresh === null || fresh === void 0 ? void 0 : fresh.edition) || !(character === null || character === void 0 ? void 0 : character.edition) || fresh.edition === character.edition;
        const existingIsCcfolia = (character === null || character === void 0 ? void 0 : character.importOrigin) === "ccfolia" || (character === null || character === void 0 ? void 0 : character.source) === "ccfolia";
        return sameName && sameEdition && (freshIsCcfolia || existingIsCcfolia);
    });
    return candidates.length === 1 ? candidates[0].candidateIndex : -1;
}
function mergeSkillValues(oldSkills = {}, freshSkills = {}) {
    const merged = { ...(oldSkills || {}) };
    for (const [name, incomingRaw] of Object.entries(freshSkills || {})) {
        const incoming = numberOrNull(incomingRaw);
        const current = numberOrNull(merged[name]);
        if (incoming === null)
            continue;
        merged[name] = current === null ? incoming : Math.max(current, incoming);
    }
    return merged;
}
function mergeCharacterRecords(fresh, old, context = {}) {
    const origin = context.origin || (fresh === null || fresh === void 0 ? void 0 : fresh.importOrigin) || "charsheet";
    const oldStats = (old === null || old === void 0 ? void 0 : old.characteristics) || {};
    const freshStats = (fresh === null || fresh === void 0 ? void 0 : fresh.characteristics) || {};
    const characteristics = { ...oldStats, ...freshStats };
    let sanEdited = Boolean(old === null || old === void 0 ? void 0 : old.sanEdited);
    const oldSan = numberOrNull(oldStats.SAN);
    const incomingSan = numberOrNull(freshStats.SAN);
    if (origin === "ccfolia") {
        if (incomingSan !== null) {
            if (sanEdited && oldSan !== null && oldSan !== incomingSan) {
                const usePawnSan = confirm(`${(old === null || old === void 0 ? void 0 : old.name) || (fresh === null || fresh === void 0 ? void 0 : fresh.name) || "探索者"} のSANがCollectionの手動値とコマで異なります。\n\n` +
                    `Collection：${oldSan}\nコマ：${incomingSan}\n\n` +
                    `OK → コマの値 ${incomingSan} に更新\nキャンセル → 今の値 ${oldSan} を残す`);
                if (usePawnSan) {
                    characteristics.SAN = incomingSan;
                    sanEdited = false;
                }
                else {
                    characteristics.SAN = oldSan;
                }
            }
            else {
                characteristics.SAN = incomingSan;
                sanEdited = false;
            }
        }
        else if (oldSan !== null) {
            characteristics.SAN = oldSan;
        }
    }
    else {
        // キャラシ再取り込みでは現在SANを戻さない。初回だけキャラシSANを採用する。
        if (oldSan !== null)
            characteristics.SAN = oldSan;
        else if (incomingSan !== null)
            characteristics.SAN = incomingSan;
    }
    const oldInfo = detectSupportedSource(old === null || old === void 0 ? void 0 : old.url);
    const freshInfo = detectSupportedSource(fresh === null || fresh === void 0 ? void 0 : fresh.url);
    const canonicalInfo = oldInfo || freshInfo;
    const canonicalUrl = (canonicalInfo === null || canonicalInfo === void 0 ? void 0 : canonicalInfo.url) || (fresh === null || fresh === void 0 ? void 0 : fresh.url) || (old === null || old === void 0 ? void 0 : old.url) || "";
    const canonicalId = canonicalInfo
        ? `${canonicalInfo.source}:${canonicalInfo.characterId}`
        : ((old === null || old === void 0 ? void 0 : old.id) || (fresh === null || fresh === void 0 ? void 0 : fresh.id) || "");
    const canonicalSource = (canonicalInfo === null || canonicalInfo === void 0 ? void 0 : canonicalInfo.source) || (old === null || old === void 0 ? void 0 : old.source) || (fresh === null || fresh === void 0 ? void 0 : fresh.source) || (origin === "ccfolia" ? "ccfolia" : "charaeno");
    const canonicalLabel = (canonicalInfo === null || canonicalInfo === void 0 ? void 0 : canonicalInfo.label) || (old === null || old === void 0 ? void 0 : old.sourceLabel) || (fresh === null || fresh === void 0 ? void 0 : fresh.sourceLabel) || (origin === "ccfolia" ? "ココフォリア" : "キャラシ");
    let image = (old === null || old === void 0 ? void 0 : old.image) || "";
    let imageSource = (old === null || old === void 0 ? void 0 : old.imageSource) || (image ? "legacy" : "");
    if (origin === "ccfolia") {
        if (fresh === null || fresh === void 0 ? void 0 : fresh.image) {
            image = fresh.image;
            imageSource = "ccfolia";
        }
    }
    else if (!(image && ["ccfolia", "legacy"].includes(imageSource))) {
        if (fresh === null || fresh === void 0 ? void 0 : fresh.image) {
            image = fresh.image;
            imageSource = "charsheet";
        }
    }
    else if (!image && (fresh === null || fresh === void 0 ? void 0 : fresh.image)) {
        image = fresh.image;
        imageSource = "charsheet";
    }
    const oldColor = normalizeHex(old === null || old === void 0 ? void 0 : old.color) || DEFAULT_COLOR;
    const incomingColor = normalizeHex(fresh === null || fresh === void 0 ? void 0 : fresh.color) || DEFAULT_COLOR;
    const oldColorEdited = Boolean(old === null || old === void 0 ? void 0 : old.colorEdited);
    let color = oldColor;
    let colorSource = (old === null || old === void 0 ? void 0 : old.colorSource) || "";
    if (!oldColorEdited) {
        if (origin === "ccfolia" && (fresh === null || fresh === void 0 ? void 0 : fresh.hasImportedColor)) {
            color = incomingColor;
            colorSource = "ccfolia";
        }
        else if (origin !== "ccfolia" && !["ccfolia", "legacy"].includes(colorSource) && (fresh === null || fresh === void 0 ? void 0 : fresh.hasImportedColor)) {
            color = incomingColor;
            colorSource = "charsheet";
        }
    }
    const oldNameEdited = Boolean(old === null || old === void 0 ? void 0 : old.nameEdited);
    let name = (old === null || old === void 0 ? void 0 : old.name) || (fresh === null || fresh === void 0 ? void 0 : fresh.name) || "";
    let nameSource = (old === null || old === void 0 ? void 0 : old.nameSource) || "";
    if (!oldNameEdited) {
        if (origin === "ccfolia" && (fresh === null || fresh === void 0 ? void 0 : fresh.name)) {
            name = fresh.name;
            nameSource = "ccfolia";
        }
        else if (origin !== "ccfolia" && !["ccfolia", "legacy"].includes(nameSource) && (fresh === null || fresh === void 0 ? void 0 : fresh.name)) {
            name = fresh.name;
            nameSource = "charsheet";
        }
    }
    return {
        ...old,
        ...fresh,
        id: canonicalId,
        source: canonicalSource,
        sourceLabel: canonicalLabel,
        importOrigin: origin,
        url: canonicalUrl,
        edition: (fresh === null || fresh === void 0 ? void 0 : fresh.edition) || (old === null || old === void 0 ? void 0 : old.edition) || "",
        editionEdited: origin === "ccfolia" ? true : Boolean(fresh === null || fresh === void 0 ? void 0 : fresh.editionEdited),
        name,
        nameSource,
        ruby: (old === null || old === void 0 ? void 0 : old.rubyEdited) ? old.ruby : ((fresh === null || fresh === void 0 ? void 0 : fresh.ruby) || (old === null || old === void 0 ? void 0 : old.ruby) || ""),
        occupation: origin === "ccfolia"
            ? ((old === null || old === void 0 ? void 0 : old.occupation) || (fresh === null || fresh === void 0 ? void 0 : fresh.occupation) || "")
            : ((fresh === null || fresh === void 0 ? void 0 : fresh.occupation) || (old === null || old === void 0 ? void 0 : old.occupation) || ""),
        color,
        colorSource,
        colorEdited: oldColorEdited,
        image,
        imageSource,
        characteristics,
        extras: { ...((old === null || old === void 0 ? void 0 : old.extras) || {}), ...((fresh === null || fresh === void 0 ? void 0 : fresh.extras) || {}) },
        skills: mergeSkillValues(old === null || old === void 0 ? void 0 : old.skills, fresh === null || fresh === void 0 ? void 0 : fresh.skills),
        sanEdited,
        nameEdited: oldNameEdited,
        rubyEdited: Boolean(old === null || old === void 0 ? void 0 : old.rubyEdited),
        statusMasked: Boolean(old === null || old === void 0 ? void 0 : old.statusMasked),
        skillMasked: Boolean(old === null || old === void 0 ? void 0 : old.skillMasked),
        updatedAt: Date.now()
    };
}
function mergeImportedCharacter(fresh, old, context = {}) {
    return mergeCharacterRecords(fresh, old, context);
}
function migrateCharacter(old) {
    if (!old || typeof old !== "object")
        return old;
    const sourceInfo = detectSupportedSource(old.url);
    const color = normalizeHex(old.color) || DEFAULT_COLOR;
    return {
        ...old,
        source: old.source || (sourceInfo === null || sourceInfo === void 0 ? void 0 : sourceInfo.source) || "charaeno",
        sourceLabel: old.sourceLabel || (sourceInfo === null || sourceInfo === void 0 ? void 0 : sourceInfo.label) || (old.source === "iachara" ? "いあきゃら" : "Charaeno"),
        edition: ["6th", "7th"].includes(old.edition) ? old.edition : "",
        editionEdited: Boolean(old.editionEdited || ["6th", "7th"].includes(old.edition)),
        color,
        colorEdited: typeof old.colorEdited === "boolean" ? old.colorEdited : color !== DEFAULT_COLOR,
        importOrigin: old.importOrigin || (old.source === "ccfolia" ? "ccfolia" : ""),
        nameSource: old.nameSource || (old.name ? "legacy" : ""),
        imageSource: old.imageSource || (old.image ? "legacy" : ""),
        colorSource: old.colorSource || ((normalizeHex(old.color) && normalizeHex(old.color) !== DEFAULT_COLOR) ? "legacy" : ""),
        hasImportedColor: Boolean(old.hasImportedColor),
        sanEdited: Boolean(old.sanEdited),
        statusMasked: Boolean(old.statusMasked),
        skillMasked: Boolean(old.skillMasked),
        characteristics: old.characteristics || {},
        extras: old.extras || {},
        skills: old.skills || {}
    };
}
function collectCharacteristics(obj, out) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    if (!obj || typeof obj !== "object")
        return;
    const candidates = [
        obj.characteristics,
        obj.params,
        obj.parameters,
        obj.status,
        obj.attribute,
        obj.attributes,
        (_a = obj.data) === null || _a === void 0 ? void 0 : _a.characteristics,
        (_b = obj.data) === null || _b === void 0 ? void 0 : _b.params,
        (_c = obj.data) === null || _c === void 0 ? void 0 : _c.status,
        (_d = obj.data) === null || _d === void 0 ? void 0 : _d.attribute
    ];
    for (const candidate of candidates) {
        if (!candidate)
            continue;
        if (Array.isArray(candidate)) {
            for (const item of candidate) {
                const label = String((_f = (_e = item === null || item === void 0 ? void 0 : item.label) !== null && _e !== void 0 ? _e : item === null || item === void 0 ? void 0 : item.name) !== null && _f !== void 0 ? _f : "").trim();
                const value = numberOrNull((_h = (_g = item === null || item === void 0 ? void 0 : item.value) !== null && _g !== void 0 ? _g : item === null || item === void 0 ? void 0 : item.current) !== null && _h !== void 0 ? _h : item === null || item === void 0 ? void 0 : item.max);
                if (label && value !== null)
                    setCharacteristic(out, label, value);
            }
        }
        else if (typeof candidate === "object") {
            for (const [key, valueRaw] of Object.entries(candidate)) {
                let value = valueRaw;
                if (valueRaw && typeof valueRaw === "object")
                    value = (_k = (_j = valueRaw.value) !== null && _j !== void 0 ? _j : valueRaw.current) !== null && _k !== void 0 ? _k : valueRaw.max;
                const num = numberOrNull(value);
                if (num !== null)
                    setCharacteristic(out, key, num);
            }
        }
    }
    for (const key of ["str", "con", "pow", "dex", "app", "siz", "int", "edu", "hp", "mp", "san", "luck", "idea", "knowledge"]) {
        const num = numberOrNull(obj[key]);
        if (num !== null)
            setCharacteristic(out, key, num);
    }
}
function setCharacteristic(out, key, value) {
    const normalized = normalizeCharacteristicLabel(key);
    if (normalized)
        out[normalized] = value;
}
function normalizeCharacteristicLabel(key) {
    const k = String(key).trim();
    const upper = k.toUpperCase();
    if (["STR", "CON", "POW", "DEX", "APP", "SIZ", "INT", "EDU", "HP", "MP", "SAN", "BLD", "MOV"].includes(upper))
        return upper;
    const map = {
        luck: "幸運", lck: "幸運", "幸運": "幸運",
        idea: "アイデア", "アイデア": "アイデア", "アイディア": "アイデア",
        knowledge: "知識", know: "知識", "知識": "知識"
    };
    return map[k.toLowerCase()] || map[k] || null;
}
function collectTextStats(obj, out) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    if (!obj || typeof obj !== "object")
        return;
    const candidates = [
        obj.params,
        obj.parameters,
        obj.characteristics,
        (_a = obj.data) === null || _a === void 0 ? void 0 : _a.params,
        (_b = obj.data) === null || _b === void 0 ? void 0 : _b.parameters,
        (_c = obj.data) === null || _c === void 0 ? void 0 : _c.characteristics
    ];
    for (const candidate of candidates) {
        if (!candidate)
            continue;
        if (Array.isArray(candidate)) {
            for (const item of candidate) {
                const label = String((_e = (_d = item === null || item === void 0 ? void 0 : item.label) !== null && _d !== void 0 ? _d : item === null || item === void 0 ? void 0 : item.name) !== null && _e !== void 0 ? _e : "").trim();
                if (!/^(DB|ダメージ[・･\s-]*ボーナス)$/i.test(label))
                    continue;
                const value = (_g = (_f = item === null || item === void 0 ? void 0 : item.value) !== null && _f !== void 0 ? _f : item === null || item === void 0 ? void 0 : item.current) !== null && _g !== void 0 ? _g : item === null || item === void 0 ? void 0 : item.max;
                if (value !== undefined && value !== null && String(value).trim())
                    out.DB = String(value).trim();
            }
        }
        else if (typeof candidate === "object") {
            for (const [key, rawValue] of Object.entries(candidate)) {
                if (!/^(DB|ダメージ[・･\s-]*ボーナス)$/i.test(String(key).trim()))
                    continue;
                const value = rawValue && typeof rawValue === "object"
                    ? ((_j = (_h = rawValue.value) !== null && _h !== void 0 ? _h : rawValue.current) !== null && _j !== void 0 ? _j : rawValue.max)
                    : rawValue;
                if (value !== undefined && value !== null && String(value).trim())
                    out.DB = String(value).trim();
            }
        }
    }
    for (const [key, rawValue] of Object.entries(obj)) {
        if (!/^(DB|ダメージ[・･\s-]*ボーナス)$/i.test(String(key).trim()))
            continue;
        const value = rawValue && typeof rawValue === "object"
            ? ((_l = (_k = rawValue.value) !== null && _k !== void 0 ? _k : rawValue.current) !== null && _l !== void 0 ? _l : rawValue.max)
            : rawValue;
        if (value !== undefined && value !== null && String(value).trim())
            out.DB = String(value).trim();
    }
}
function collectSkills(obj, out) {
    var _a, _b, _c, _d, _e, _f, _g;
    if (!obj || typeof obj !== "object")
        return;
    const arrays = [];
    const obvious = [obj.skills, obj.skill, obj.skillList, (_a = obj.data) === null || _a === void 0 ? void 0 : _a.skills, (_b = obj.data) === null || _b === void 0 ? void 0 : _b.skillList];
    for (const value of obvious)
        if (Array.isArray(value))
            arrays.push(value);
    // Data structures occasionally wrap skills deeper. Only inspect arrays whose
    // objects look skill-like to avoid picking up backstory/items.
    walk(obj, (value, key) => {
        if (!Array.isArray(value) || !/skill|技能/i.test(String(key)))
            return;
        arrays.push(value);
    }, 4);
    for (const arr of arrays) {
        for (const skill of arr) {
            if (!skill || typeof skill !== "object")
                continue;
            const name = (_c = firstString(skill.name, skill.label, skill.skillName, skill.title)) === null || _c === void 0 ? void 0 : _c.trim();
            const value = numberOrNull((_g = (_f = (_e = (_d = skill.value) !== null && _d !== void 0 ? _d : skill.total) !== null && _e !== void 0 ? _e : skill.current) !== null && _f !== void 0 ? _f : skill.score) !== null && _g !== void 0 ? _g : skill.percent);
            if (name && value !== null)
                out[normalizeSkillName(name)] = value;
        }
    }
}
function collectCommands(commands, skills, characteristics) {
    var _a;
    if (typeof commands !== "string")
        return;
    for (const line of commands.split(/\r?\n/)) {
        // CoC6: CCB<=63 目星 / CoC7: CC<=70 【目星】
        const match = line.match(/(?:CCB?|1D100)\s*<=?\s*([0-9]+)\s+(.+)$/i);
        if (!match)
            continue;
        const value = Number(match[1]);
        let label = cleanCommandLabel(match[2]);
        if (!label)
            continue;
        const statX5 = label.match(/^(STR|CON|POW|DEX|APP|SIZ|INT|EDU)×5$/i);
        if (statX5) {
            const stat = statX5[1].toUpperCase();
            if (characteristics[stat] == null && value % 5 === 0)
                characteristics[stat] = value / 5;
            continue;
        }
        if (["幸運", "アイデア", "アイディア", "知識"].includes(label)) {
            const normalizedLabel = label === "アイディア" ? "アイデア" : label;
            (_a = characteristics[normalizedLabel]) !== null && _a !== void 0 ? _a : (characteristics[normalizedLabel] = value);
            continue;
        }
        if (/^(SAN|正気度|正気度ロール)$/i.test(label))
            continue;
        skills[normalizeSkillName(label)] = value;
    }
}
function cleanCommandLabel(label) {
    return String(label || "")
        .trim()
        .replace(/^【\s*/u, "")
        .replace(/\s*】$/u, "")
        .replace(/^\[\s*/u, "")
        .replace(/\s*\]$/u, "")
        .replace(/\s+正気度ロール.*$/u, "")
        .trim();
}
function normalizeSkillName(name) {
    return String(name)
        .trim()
        .replace(/\s+/g, " ")
        .replace(/\(/g, "（")
        .replace(/\)/g, "）");
}
function splitNameAndRuby(text) {
    const name = String(text || "").trim();
    const match = name.match(/^(.*?)\s*[（(]([^()（）]+)[）)]\s*$/u);
    if (!match)
        return { name, ruby: "" };
    return { name: match[1].trim(), ruby: match[2].trim() };
}
function findImageUrl(obj, baseUrl) {
    const candidates = [];
    walk(obj, (value, key) => {
        if (typeof value !== "string")
            return;
        const k = String(key || "");
        if (!/(image|img|portrait|avatar|picture|thumbnail|photo)/i.test(k))
            return;
        if (!looksLikeImage(value))
            return;
        candidates.push(value);
    }, 6);
    return chooseImage(candidates, baseUrl);
}
function findImageInHtml(html, baseUrl) {
    var _a;
    if (!html)
        return "";
    const candidates = [];
    try {
        const doc = new DOMParser().parseFromString(html, "text/html");
        // Generic page previews often point to a Charaeno/site image, so only keep
        // metadata URLs that themselves look character-image-specific.
        for (const selector of [
            'meta[property="og:image"]',
            'meta[name="twitter:image"]',
            'meta[property="twitter:image"]'
        ]) {
            const el = doc.querySelector(selector);
            const content = el === null || el === void 0 ? void 0 : el.getAttribute("content");
            if (content && /character|chara|portrait|avatar|upload|image/i.test(content))
                candidates.push(content);
        }
        // Do not treat every <img> as a portrait. If the sheet has no explorer
        // image, generic site graphics must not become the card image.
        for (const img of doc.querySelectorAll("img[src]")) {
            const src = img.getAttribute("src");
            const alt = img.getAttribute("alt") || "";
            const cls = img.getAttribute("class") || "";
            const id = img.getAttribute("id") || "";
            const parentClass = ((_a = img.parentElement) === null || _a === void 0 ? void 0 : _a.getAttribute("class")) || "";
            const hint = `${alt} ${cls} ${id} ${parentClass}`;
            if (src && /探索者|character|portrait|立ち絵|探索者画像|avatar/i.test(hint))
                candidates.push(src);
        }
    }
    catch (error) {
        console.warn("DOM parse failed", error);
    }
    return chooseImage(candidates, baseUrl);
}
function chooseImage(candidates, baseUrl) {
    const cleaned = [];
    for (const raw of candidates) {
        if (!raw || typeof raw !== "string")
            continue;
        if (/logomark|logo\.|favicon|icon[-_.]|material-icons/i.test(raw))
            continue;
        try {
            const url = new URL(raw, baseUrl).href;
            if (!cleaned.includes(url))
                cleaned.push(url);
        }
        catch { }
    }
    return cleaned[0] || "";
}
function looksLikeImage(value) {
    return /^data:image\//i.test(value) || /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(value) || /^https?:\/\//i.test(value);
}
function extractEmbeddedDataFromHtml(html) {
    if (!html)
        return null;
    try {
        const doc = new DOMParser().parseFromString(html, "text/html");
        const scripts = [...doc.querySelectorAll('script[type="application/json"], script#__NEXT_DATA__')];
        for (const script of scripts) {
            try {
                const parsed = JSON.parse(script.textContent || "");
                const found = findCharacterLikeObject(parsed);
                if (found)
                    return found;
            }
            catch { }
        }
    }
    catch { }
    return null;
}
function findCharacterLikeObject(root) {
    let answer = null;
    walk(root, (value) => {
        var _a, _b;
        if (answer || !value || typeof value !== "object" || Array.isArray(value))
            return;
        const hasName = typeof value.name === "string" && value.name.trim();
        const hasSkills = Array.isArray(value.skills) || Array.isArray((_a = value.data) === null || _a === void 0 ? void 0 : _a.skills);
        const hasStats = value.characteristics || value.params || ((_b = value.data) === null || _b === void 0 ? void 0 : _b.params);
        if (hasName && (hasSkills || hasStats))
            answer = value;
    }, 7);
    return answer;
}
function parseRenderedHtml(html) {
    var _a, _b;
    const result = { name: "", occupation: "", characteristics: {}, skills: {} };
    if (!html)
        return result;
    try {
        const doc = new DOMParser().parseFromString(html, "text/html");
        const title = ((_a = doc.querySelector("title")) === null || _a === void 0 ? void 0 : _a.textContent) || "";
        result.name = title.replace(/\s*\|\s*Charaeno.*$/i, "").trim();
        const text = ((_b = doc.body) === null || _b === void 0 ? void 0 : _b.innerText) || "";
        for (const stat of ["STR", "CON", "POW", "DEX", "APP", "SIZ", "INT", "EDU", "HP", "MP"]) {
            const m = text.match(new RegExp(`${stat}\\s*[：:]?\\s*(\\d+)`, "i"));
            if (m)
                result.characteristics[stat] = Number(m[1]);
        }
    }
    catch { }
    return result;
}
function walk(root, visitor, maxDepth = 5) {
    const seen = new WeakSet();
    const visit = (value, key, depth) => {
        if (depth > maxDepth || value == null)
            return;
        visitor(value, key, depth);
        if (typeof value !== "object")
            return;
        if (seen.has(value))
            return;
        seen.add(value);
        if (Array.isArray(value)) {
            value.forEach((item, index) => visit(item, String(index), depth + 1));
        }
        else {
            Object.entries(value).forEach(([k, v]) => visit(v, k, depth + 1));
        }
    };
    visit(root, "", 0);
}
function firstString(...values) {
    for (const value of values)
        if (typeof value === "string" && value.trim())
            return value.trim();
    return null;
}
function numberOrNull(value) {
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (typeof value === "string") {
        const m = value.trim().match(/^-?\d+(?:\.\d+)?$/);
        if (m)
            return Number(value);
    }
    return null;
}
function renderAll() {
    rebuildSortOptions();
    updateNameSearchMenu();
    updateStatusToggle();
    updateSkillToggle();
    updateEditionTabs();
    renderCards();
}
async function setEditionFilter(next) {
    if (!["all", "6th", "7th"].includes(next))
        return;
    editionFilter = next;
    await chrome.storage.local.set({ [EDITION_FILTER_KEY]: editionFilter });
    updateEditionTabs();
    updateNameSearchMenu();
    renderCards();
}
function updateEditionTabs() {
    const map = { all: ui.tabAll, "6th": ui.tab6th, "7th": ui.tab7th };
    for (const [key, button] of Object.entries(map)) {
        const active = editionFilter === key;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
    }
}
function normalizeNameSearchText(value) {
    return String(value || "").normalize("NFKC").toLocaleLowerCase("ja").replace(/\s+/g, "");
}
function characterMatchesNameQuery(character) {
    const query = normalizeNameSearchText(nameQuery);
    if (!query)
        return true;
    const name = normalizeNameSearchText(character && character.name);
    const ruby = normalizeNameSearchText(character && character.ruby);
    return name.includes(query) || ruby.includes(query);
}
function getNameSearchCandidates() {
    const query = normalizeNameSearchText(nameQuery);
    return characters
        .filter((character) => editionFilter === "all" || character.edition === editionFilter)
        .filter((character) => {
            if (!query)
                return true;
            return characterMatchesNameQuery(character);
        })
        .slice()
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ja"));
}
function chooseNameSearchCandidate(character) {
    nameQuery = String(character && character.name || "");
    ui.nameSearchInput.value = nameQuery;
    nameMenuOpen = false;
    updateNameSearchMenu();
    renderCards();
}
function updateNameSearchMenu() {
    if (!ui.nameSearchMenu || !ui.nameSearchToggle)
        return;
    ui.nameSearchMenu.replaceChildren();
    ui.nameSearchMenu.hidden = !nameMenuOpen;
    ui.nameSearchToggle.setAttribute("aria-expanded", String(nameMenuOpen));
    ui.nameSearchToggle.classList.toggle("active", nameMenuOpen);
    if (!nameMenuOpen)
        return;
    const candidates = getNameSearchCandidates();
    if (!candidates.length) {
        const empty = document.createElement("div");
        empty.className = "name-search-empty";
        empty.textContent = "一致する探索者はいません";
        ui.nameSearchMenu.append(empty);
        return;
    }
    for (const character of candidates) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "name-search-option";
        button.setAttribute("role", "option");
        const name = document.createElement("span");
        name.className = "name-search-option-name";
        name.textContent = character.name || "（名称なし）";
        button.append(name);
        if (character.ruby) {
            const ruby = document.createElement("small");
            ruby.textContent = character.ruby;
            button.append(ruby);
        }
        button.addEventListener("click", () => chooseNameSearchCandidate(character));
        ui.nameSearchMenu.append(button);
    }
}
function rebuildSortOptions() {
    const previous = [...sortKeys];
    const allSkills = [...new Set(characters.flatMap((c) => Object.keys(c.skills || {})))].sort((a, b) => a.localeCompare(b, "ja"));
    const allStats = [...new Set(characters.flatMap((c) => Object.keys(c.characteristics || {})))];
    allStats.sort((a, b) => {
        const ai = STAT_ORDER.indexOf(a);
        const bi = STAT_ORDER.indexOf(b);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) || a.localeCompare(b, "ja");
    });
    sortChoices = [
        ...allSkills.map((label) => ({ label, key: `skill:${label}`, type: "技能" })),
        ...allStats.map((label) => ({ label, key: `stat:${label}`, type: "能力値" }))
    ];
    ui.sortDatalist.replaceChildren();
    for (const choice of sortChoices) {
        const option = document.createElement("option");
        option.value = choice.label;
        option.label = choice.type;
        ui.sortDatalist.append(option);
    }
    const available = new Set(sortChoices.map((c) => c.key));
    const stillAvailable = previous.filter((key) => available.has(key));
    if (stillAvailable.length === previous.length && stillAvailable.length)
        sortKeys = stillAvailable;
    else if (available.has("skill:目星"))
        sortKeys = ["skill:目星"];
    else if (available.has("stat:DEX"))
        sortKeys = ["stat:DEX"];
    else
        sortKeys = sortChoices[0] ? [sortChoices[0].key] : [];
    ui.sortInput.value = sortLabel(sortKeys);
    ui.sortInput.disabled = available.size === 0;
}
function deserializeSortKeys(saved) {
    if (Array.isArray(saved))
        return saved.filter((v) => typeof v === "string" && v);
    if (typeof saved === "string" && saved.trim())
        return saved.split("|").filter(Boolean);
    return ["skill:目星"];
}
function serializeSortKeys(keys) {
    return (Array.isArray(keys) ? keys : []).join("|");
}
function hasMultiSeparator(value) {
    // JavaScriptの\sは半角スペース・全角スペース(U+3000)の両方を含む。
    return /\s/u.test(String(value || "").trim());
}
function parseSortQuery(raw, allowPartial) {
    const text = String(raw || "").trim();
    if (!text)
        return null;
    // v0.5.5: 半角/全角スペースで複数項目を区切る。
    // 旧版で保存した入力との互換用に + / ＋ も受け付けるが、画面上ではスペース表示に統一。
    const parts = text.split(/(?:\s+|\s*[+＋]\s*)/u).map((v) => v.trim()).filter(Boolean);
    if (!parts.length)
        return null;
    const found = [];
    for (const part of parts) {
        const choice = findSortChoice(part, allowPartial);
        if (!choice)
            return null;
        if (!found.some((item) => item.key === choice.key))
            found.push(choice);
    }
    return found.length ? found : null;
}
function findSortChoice(raw, allowPartial) {
    const q = String(raw || "").trim();
    if (!q)
        return null;
    const normalized = q.toLocaleLowerCase("ja");
    const exact = sortChoices.find((c) => c.label.toLocaleLowerCase("ja") === normalized);
    if (exact)
        return exact;
    if (!allowPartial)
        return null;
    const starts = sortChoices.filter((c) => c.label.toLocaleLowerCase("ja").startsWith(normalized));
    if (starts.length === 1)
        return starts[0];
    const contains = sortChoices.filter((c) => c.label.toLocaleLowerCase("ja").includes(normalized));
    if (contains.length === 1)
        return contains[0];
    return null;
}
async function applySortChoices(choices) {
    if (!Array.isArray(choices) || !choices.length)
        return;
    const nextKeys = choices.map((choice) => choice.key);
    const same = nextKeys.length === sortKeys.length && nextKeys.every((key, i) => key === sortKeys[i]);
    sortKeys = nextKeys;
    ui.sortInput.value = choices.map((choice) => choice.label).join(" ");
    if (!same)
        await chrome.storage.local.set({ [SORT_KEY]: serializeSortKeys(sortKeys) });
    renderCards();
}
function applySortChoice(choice) {
    return applySortChoices(choice ? [choice] : []);
}
function updateStatusToggle() {
    ui.statusToggleBtn.textContent = statusVisible ? "STATUSを隠す" : "STATUSを表示";
    ui.statusToggleBtn.setAttribute("aria-pressed", String(!statusVisible));
    ui.statusToggleBtn.classList.toggle("active", !statusVisible);
}
function updateSkillToggle() {
    ui.skillToggleBtn.textContent = skillVisible ? "SKILLを隠す" : "SKILLを表示";
    ui.skillToggleBtn.setAttribute("aria-pressed", String(!skillVisible));
    ui.skillToggleBtn.classList.toggle("active", !skillVisible);
}
function renderCards() {
    releaseObjectUrls();
    ui.cards.replaceChildren();
    ui.cards.classList.toggle("stacked-groups", editionFilter === "all");
    ui.emptyState.hidden = characters.length !== 0;
    if (!characters.length) {
        ui.countValue.textContent = "0";
        return;
    }
    const entries = characters
        .map((character, originalIndex) => ({ character, originalIndex }))
        .filter((entry) => characterMatchesNameQuery(entry.character));
    const groups = {
        "6th": entries.filter((entry) => entry.character.edition === "6th"),
        "7th": entries.filter((entry) => entry.character.edition === "7th"),
        "": entries.filter((entry) => !entry.character.edition || !["6th", "7th"].includes(entry.character.edition))
    };
    if (editionFilter === "all") {
        const visibleCount = groups["6th"].length + groups["7th"].length + groups[""].length;
        ui.countValue.textContent = String(visibleCount);
        renderEditionSection("6版", groups["6th"]);
        renderEditionSection("7版", groups["7th"]);
        renderEditionSection("未判定", groups[""]);
    }
    else {
        const visible = groups[editionFilter] || [];
        ui.countValue.textContent = String(visible.length);
        renderEntryGrid(visible, ui.cards);
    }
}
function renderEditionSection(title, entries) {
    if (!entries.length)
        return;
    const section = document.createElement("section");
    section.className = "edition-section";
    const heading = document.createElement("div");
    heading.className = "edition-heading";
    const strong = document.createElement("strong");
    strong.textContent = title;
    const small = document.createElement("small");
    small.textContent = `${entries.length}人`;
    heading.append(strong, small);
    const grid = document.createElement("div");
    grid.className = "edition-cards";
    section.append(heading, grid);
    ui.cards.append(section);
    renderEntryGrid(entries, grid);
}
function renderEntryGrid(entries, container) {
    const sortedEntries = rankAndSortEntries(entries, sortKeys);
    sortedEntries.forEach((entry, displayIndex) => container.append(renderCharacterCard(entry, displayIndex)));
}
function rankAndSortEntries(entries, keys) {
    const multiMode = Array.isArray(keys) && keys.length > 1;
    const rankingMaps = buildRankingMapsForEntries(entries, keys);
    if (multiMode) {
        return entries
            .map(({ character, originalIndex }) => {
            const placements = getPlacementsForEntry(originalIndex, keys, rankingMaps)
                .filter((item) => item.rank <= 3);
            return { character, originalIndex, placements };
        })
            .filter((item) => item.placements.length > 0)
            .sort((a, b) => {
            const aBest = Math.min(...a.placements.map((p) => p.rank));
            const bBest = Math.min(...b.placements.map((p) => p.rank));
            if (aBest !== bBest)
                return aBest - bBest;
            if (a.placements.length !== b.placements.length)
                return b.placements.length - a.placements.length;
            const aFirst = Math.min(...a.placements.map((p) => keys.indexOf(p.key)));
            const bFirst = Math.min(...b.placements.map((p) => keys.indexOf(p.key)));
            return aFirst - bFirst || a.character.name.localeCompare(b.character.name, "ja");
        });
    }
    const key = keys[0];
    const rankMap = rankingMaps.get(key) || new Map();
    return entries
        .map(({ character, originalIndex }) => {
        var _a;
        return ({
            character,
            originalIndex,
            value: getSingleSortRawValue(character, key),
            rank: (_a = rankMap.get(originalIndex)) !== null && _a !== void 0 ? _a : null,
            placements: getPlacementsForEntry(originalIndex, keys, rankingMaps)
        });
    })
        .sort((a, b) => {
        const av = a.value == null ? -Infinity : a.value;
        const bv = b.value == null ? -Infinity : b.value;
        return bv - av || a.character.name.localeCompare(b.character.name, "ja");
    });
}
function buildRankingMapsForEntries(entries, keys) {
    const maps = new Map();
    for (const key of (Array.isArray(keys) ? keys : [])) {
        const ranked = entries
            .map(({ character, originalIndex }) => ({
            originalIndex,
            character,
            value: getSingleSortRawValue(character, key)
        }))
            .filter((item) => item.value !== null && item.value !== undefined)
            .sort((a, b) => b.value - a.value || a.character.name.localeCompare(b.character.name, "ja"));
        const map = new Map();
        ranked.forEach((item, index) => map.set(item.originalIndex, index + 1));
        maps.set(key, map);
    }
    return maps;
}
function getPlacementsForEntry(originalIndex, keys, rankingMaps) {
    var _a;
    const placements = [];
    for (const key of (Array.isArray(keys) ? keys : [])) {
        const rank = (_a = rankingMaps.get(key)) === null || _a === void 0 ? void 0 : _a.get(originalIndex);
        if (rank == null)
            continue;
        placements.push({ key, rank });
    }
    return placements;
}
function formatUpdatedDate(value) {
    const timestamp = Number(value);
    if (!Number.isFinite(timestamp) || timestamp <= 0)
        return "更新日 未記録";
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime()))
        return "更新日 未記録";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `更新 ${year}/${month}/${day}`;
}
function renderCharacterCard({ character, originalIndex, value, rank, placements }, displayIndex = 0) {
    var _a, _b;
    const multiMode = Array.isArray(sortKeys) && sortKeys.length > 1;
    const node = ui.cardTemplate.content.firstElementChild.cloneNode(true);
    const color = normalizeHex(character.color) || DEFAULT_COLOR;
    node.style.setProperty("--char-color", color);
    const updatedDate = node.querySelector(".updated-date");
    if (updatedDate) {
        updatedDate.textContent = formatUpdatedDate(character.updatedAt);
        updatedDate.title = character.updatedAt ? `最終更新: ${new Date(Number(character.updatedAt)).toLocaleString("ja-JP")}` : "最終更新日はまだ記録されていません";
    }
    node.classList.toggle("status-hidden", !statusVisible);
    node.classList.toggle("skill-hidden", !skillVisible);
    node.classList.toggle("status-masked", Boolean(character.statusMasked));
    node.classList.toggle("skill-masked", Boolean(character.skillMasked));
    const rankBadge = node.querySelector(".rank-badge");
    rankBadge.classList.remove("rank-1", "rank-2", "rank-3", "multi-rank");
    if (multiMode) {
        const topPlacements = placements || [];
        const bestRank = topPlacements.length ? Math.min(...topPlacements.map((p) => p.rank)) : null;
        rankBadge.classList.add("multi-rank");
        if (bestRank && bestRank <= 3)
            rankBadge.classList.add(`rank-${bestRank}`);
        rankBadge.textContent = topPlacements.map((p) => `👑 ${sortKeyLabel(p.key)}#${p.rank}`).join(" · ");
        rankBadge.title = topPlacements.map((p) => `${sortKeyLabel(p.key)} ${p.rank}位`).join(" / ");
    }
    else {
        const rankNumber = rank !== null && rank !== void 0 ? rank : (displayIndex + 1);
        const hasRankValue = value !== null && value !== undefined && Number.isFinite(Number(value));
        if (hasRankValue && rankNumber <= 3) {
            rankBadge.textContent = `👑 #${rankNumber}`;
            rankBadge.classList.add(`rank-${rankNumber}`);
            rankBadge.title = `${sortLabel(sortKeys)} ${rankNumber}位`;
        }
        else {
            rankBadge.textContent = `#${rankNumber}`;
            rankBadge.title = `${rankNumber}位`;
        }
    }
    const img = node.querySelector(".portrait");
    const fallback = node.querySelector(".portrait-fallback");
    img.alt = `${character.name}の画像`;
    img.addEventListener("load", () => { fallback.style.display = "none"; });
    img.addEventListener("error", () => { img.hidden = true; fallback.style.display = "grid"; });
    void applyPortraitImage(img, fallback, character);
    node.querySelector(".character-name").textContent = character.name;
    node.querySelector(".character-ruby").textContent = character.ruby || "　";
    node.querySelector(".color-hex").textContent = color;
    const editionLabel = character.edition === "6th" ? "CoC 6版" : character.edition === "7th" ? "CoC 7版" : "";
    const sourceLabel = character.sourceLabel || (character.source === "iachara" ? "いあきゃら" : "Charaeno");
    node.querySelector(".meta-line").textContent = [sourceLabel, editionLabel, character.occupation].filter(Boolean).join(" · ");
    node.querySelector(".score-label").textContent = formatSortLabels(sortKeys);
    node.querySelector(".score-value").textContent = formatSortDisplay(character, sortKeys);
    node.querySelector(".score-row").hidden = !skillVisible;
    node.querySelector(".show-skills").hidden = !skillVisible;
    renderStatusPanel(node, character);
    const statsPanel = node.querySelector(".stats-panel");
    if (statsPanel)
        statsPanel.hidden = !statusVisible;
    renderSkillsDrawer(node, character, sortKeys);
    const toggleSkills = () => {
        const drawer = node.querySelector(".skills-drawer");
        const open = drawer.hidden;
        drawer.hidden = !open;
        node.classList.toggle("skills-open", open);
        node.querySelector(".expand-mark").textContent = open ? "⌃" : "⌄";
        node.querySelector(".toggle-skills").setAttribute("aria-expanded", String(open));
    };
    node.querySelector(".toggle-skills").addEventListener("click", toggleSkills);
    node.querySelector(".show-skills").addEventListener("click", toggleSkills);
    node.querySelector(".copy-name").addEventListener("click", async () => {
        await navigator.clipboard.writeText(character.name);
        setMessage(`${character.name} をコピーしました。`, "ok");
    });
    node.querySelector(".open-sheet").disabled = !/^https?:\/\//i.test(character.url || "");
    node.querySelector(".open-sheet").addEventListener("click", () => chrome.tabs.create({ url: character.url }));
    node.querySelector(".delete-one").addEventListener("click", async () => {
        if (!confirm(`${character.name} を一覧から削除しますか？
元のキャラシは削除されません。`))
            return;
        const cacheKey = characterIdentity(character);
        characters.splice(originalIndex, 1);
        await saveCharacters();
        void deleteCachedImage(cacheKey);
        renderAll();
        setMessage(`${character.name} を一覧から外しました。`, "ok");
    });
    const statusMaskBtn = node.querySelector(".mask-status");
    const skillMaskBtn = node.querySelector(".mask-skill");
    const syncMaskButtons = () => {
        const current = characters[originalIndex] || character;
        const statusMasked = Boolean(current.statusMasked);
        const skillMasked = Boolean(current.skillMasked);
        node.classList.toggle("status-masked", statusMasked);
        node.classList.toggle("skill-masked", skillMasked);
        statusMaskBtn.textContent = statusMasked ? "STATUS表示" : "STATUS伏せ";
        skillMaskBtn.textContent = skillMasked ? "SKILL表示" : "SKILL伏せ";
        statusMaskBtn.classList.toggle("active", statusMasked);
        skillMaskBtn.classList.toggle("active", skillMasked);
        statusMaskBtn.setAttribute("aria-pressed", String(statusMasked));
        skillMaskBtn.setAttribute("aria-pressed", String(skillMasked));
    };
    syncMaskButtons();
    statusMaskBtn.addEventListener("click", async () => {
        var _a;
        const next = !Boolean((_a = characters[originalIndex]) === null || _a === void 0 ? void 0 : _a.statusMasked);
        characters[originalIndex] = { ...characters[originalIndex], statusMasked: next };
        await saveCharacters();
        syncMaskButtons();
    });
    skillMaskBtn.addEventListener("click", async () => {
        var _a;
        const next = !Boolean((_a = characters[originalIndex]) === null || _a === void 0 ? void 0 : _a.skillMasked);
        characters[originalIndex] = { ...characters[originalIndex], skillMasked: next };
        await saveCharacters();
        syncMaskButtons();
    });
    const editBox = node.querySelector(".edit-box");
    const nameInput = node.querySelector(".edit-name");
    const rubyInput = node.querySelector(".edit-ruby");
    const editionInput = node.querySelector(".edit-edition");
    const colorText = node.querySelector(".edit-color-text");
    const colorPicker = node.querySelector(".edit-color-picker");
    const sanInput = node.querySelector(".edit-san");
    const skillNameInput = node.querySelector(".edit-skill-name");
    const skillValueInput = node.querySelector(".edit-skill-value");
    nameInput.value = character.name;
    rubyInput.value = character.ruby || "";
    editionInput.value = ["6th", "7th"].includes(character.edition) ? character.edition : "";
    colorText.value = color;
    colorPicker.value = color;
    sanInput.value = (_b = numberOrNull((_a = character.characteristics) === null || _a === void 0 ? void 0 : _a.SAN)) !== null && _b !== void 0 ? _b : "";
    const editableSkills = Object.entries(character.skills || {})
        .filter(([, value]) => numberOrNull(value) !== null)
        .sort((a, b) => a[0].localeCompare(b[0], "ja"));
    skillNameInput.replaceChildren();
    for (const [skillName] of editableSkills) {
        const option = document.createElement("option");
        option.value = skillName;
        option.textContent = skillName;
        skillNameInput.append(option);
    }
    const syncSkillEditValue = () => {
        var _a, _b, _c;
        const selected = skillNameInput.value;
        skillValueInput.value = selected ? ((_c = numberOrNull((_b = (_a = characters[originalIndex]) === null || _a === void 0 ? void 0 : _a.skills) === null || _b === void 0 ? void 0 : _b[selected])) !== null && _c !== void 0 ? _c : "") : "";
    };
    skillNameInput.disabled = editableSkills.length === 0;
    skillValueInput.disabled = editableSkills.length === 0;
    node.querySelector(".save-skill-edit").disabled = editableSkills.length === 0;
    skillNameInput.addEventListener("change", syncSkillEditValue);
    syncSkillEditValue();
    node.querySelector(".toggle-edit").addEventListener("click", () => { editBox.hidden = !editBox.hidden; });
    const previewColor = (value) => {
        const normalized = normalizeHex(value);
        if (!normalized)
            return;
        node.style.setProperty("--char-color", normalized);
        node.querySelector(".color-hex").textContent = normalized;
    };
    colorPicker.addEventListener("input", () => {
        colorText.value = colorPicker.value.toUpperCase();
        previewColor(colorPicker.value);
    });
    colorText.addEventListener("input", () => {
        const normalized = normalizeHex(colorText.value);
        if (normalized) {
            colorPicker.value = normalized;
            previewColor(normalized);
        }
    });
    node.querySelector(".save-skill-edit").addEventListener("click", async () => {
        var _a;
        const skillName = skillNameInput.value;
        const nextSkillValue = numberOrNull(skillValueInput.value);
        if (!skillName || nextSkillValue === null) {
            setMessage("変更する技能と数値を選んでください。", "error");
            return;
        }
        characters[originalIndex] = {
            ...characters[originalIndex],
            skills: { ...(((_a = characters[originalIndex]) === null || _a === void 0 ? void 0 : _a.skills) || {}), [skillName]: nextSkillValue },
            updatedAt: Date.now()
        };
        await saveCharacters();
        renderAll();
        setMessage(`${character.name} の「${skillName}」を ${nextSkillValue} に変更しました。`, "ok");
    });
    node.querySelector(".save-edit").addEventListener("click", async () => {
        var _a, _b;
        const nextName = nameInput.value.trim() || character.name;
        const nextRuby = rubyInput.value.trim();
        const nextEdition = editionInput.value;
        const nextColor = normalizeHex(colorText.value);
        if (!nextColor) {
            setMessage("Webカラーは #RRGGBB 形式で入力してください。", "error");
            return;
        }
        const nextCharacteristics = { ...(((_a = characters[originalIndex]) === null || _a === void 0 ? void 0 : _a.characteristics) || {}) };
        const oldSan = numberOrNull(nextCharacteristics.SAN);
        const sanValue = numberOrNull(sanInput.value);
        if (sanInput.value !== "" && sanValue !== null)
            nextCharacteristics.SAN = sanValue;
        const sanWasChanged = sanInput.value !== "" && sanValue !== null && sanValue !== oldSan;
        characters[originalIndex] = {
            ...characters[originalIndex],
            name: nextName,
            ruby: nextRuby,
            edition: nextEdition,
            editionEdited: nextEdition !== character.edition || Boolean(character.editionEdited),
            color: nextColor,
            colorSource: nextColor !== (normalizeHex(character.color) || DEFAULT_COLOR) ? "manual" : (character.colorSource || ""),
            colorEdited: nextColor !== (normalizeHex(character.color) || DEFAULT_COLOR) || Boolean(character.colorEdited),
            characteristics: nextCharacteristics,
            sanEdited: sanWasChanged || Boolean((_b = characters[originalIndex]) === null || _b === void 0 ? void 0 : _b.sanEdited),
            nameEdited: nextName !== splitNameAndRuby(character.name).name || Boolean(character.nameEdited),
            nameSource: nextName !== character.name ? "manual" : (character.nameSource || ""),
            rubyEdited: nextRuby !== (character.ruby || "") || Boolean(character.rubyEdited),
            updatedAt: Date.now()
        };
        await saveCharacters();
        renderAll();
        setMessage(`${nextName} の表示設定を保存しました。`, "ok");
    });
    return node;
}
function buildRankingMaps(keys) {
    const maps = new Map();
    for (const key of (Array.isArray(keys) ? keys : [])) {
        const ranked = characters
            .map((character, originalIndex) => ({
            originalIndex,
            character,
            value: getSingleSortRawValue(character, key)
        }))
            .filter((item) => item.value !== null && item.value !== undefined)
            .sort((a, b) => b.value - a.value || a.character.name.localeCompare(b.character.name, "ja"));
        const map = new Map();
        ranked.forEach((item, index) => map.set(item.originalIndex, index + 1));
        maps.set(key, map);
    }
    return maps;
}
function getPlacementsForCharacter(originalIndex, keys, rankingMaps) {
    var _a;
    const placements = [];
    for (const key of (Array.isArray(keys) ? keys : [])) {
        const rank = (_a = rankingMaps.get(key)) === null || _a === void 0 ? void 0 : _a.get(originalIndex);
        if (rank == null)
            continue;
        placements.push({ key, rank });
    }
    return placements;
}
function renderSkillsDrawer(node, character, activeSortKeys) {
    const grid = node.querySelector(".all-skills-grid");
    const count = node.querySelector(".skill-count");
    if (!grid || !count)
        return;
    grid.replaceChildren();
    const activeSkills = new Set((activeSortKeys || [])
        .filter((key) => key === null || key === void 0 ? void 0 : key.startsWith("skill:"))
        .map((key) => key.slice(6)));
    const entries = Object.entries(character.skills || {})
        .filter(([, value]) => numberOrNull(value) !== null)
        .sort((a, b) => {
        var _a, _b;
        const av = (_a = numberOrNull(a[1])) !== null && _a !== void 0 ? _a : -Infinity;
        const bv = (_b = numberOrNull(b[1])) !== null && _b !== void 0 ? _b : -Infinity;
        return bv - av || a[0].localeCompare(b[0], "ja");
    });
    count.textContent = `${entries.length} skills`;
    for (const [name, value] of entries) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "skill-item";
        if (activeSkills.has(name))
            item.classList.add("active");
        item.title = `${name}で並べ替え`;
        const nameEl = document.createElement("span");
        nameEl.className = "skill-name";
        nameEl.textContent = name;
        const valueEl = document.createElement("strong");
        valueEl.className = "skill-value";
        valueEl.textContent = String(value);
        item.append(nameEl, valueEl);
        item.addEventListener("click", () => {
            const choice = sortChoices.find((c) => c.key === `skill:${name}`);
            if (choice)
                applySortChoice(choice);
        });
        grid.append(item);
    }
    if (!entries.length) {
        const empty = document.createElement("div");
        empty.className = "skills-empty";
        empty.textContent = "技能データなし";
        grid.append(empty);
    }
}
function renderStatusPanel(node, character) {
    var _a;
    const primary = node.querySelector(".primary-stats");
    const derived = node.querySelector(".derived-stats");
    if (!primary || !derived)
        return;
    primary.replaceChildren();
    for (const label of CARD_PRIMARY_STATS) {
        primary.append(makeStatCell(label, (_a = character.characteristics) === null || _a === void 0 ? void 0 : _a[label]));
    }
    derived.replaceChildren();
    const labels = character.edition === "7th"
        ? CARD_DERIVED_STATS_7TH
        : CARD_DERIVED_STATS_6TH;
    for (const label of labels) {
        derived.append(makeStatCell(label, getDerivedStatusValue(character, label), true));
    }
}
function getDerivedStatusValue(character, label) {
    var _a, _b, _c, _d, _e, _f;
    const stats = (character === null || character === void 0 ? void 0 : character.characteristics) || {};
    const edition = character === null || character === void 0 ? void 0 : character.edition;
    if (label === "DB") {
        const calculated = edition === "7th"
            ? calculate7thDamageBonus(stats.STR, stats.SIZ)
            : calculate6thDamageBonus(stats.STR, stats.SIZ);
        return (_b = calculated !== null && calculated !== void 0 ? calculated : (_a = character === null || character === void 0 ? void 0 : character.extras) === null || _a === void 0 ? void 0 : _a.DB) !== null && _b !== void 0 ? _b : "";
    }
    if (label === "BLD") {
        const calculated = calculate7thBuild(stats.STR, stats.SIZ);
        return (_c = calculated !== null && calculated !== void 0 ? calculated : stats.BLD) !== null && _c !== void 0 ? _c : "";
    }
    if (edition === "6th") {
        if (label === "幸運")
            return (_d = stats["幸運"]) !== null && _d !== void 0 ? _d : multiplyStat(stats.POW, 5);
        if (label === "アイデア")
            return (_e = stats["アイデア"]) !== null && _e !== void 0 ? _e : multiplyStat(stats.INT, 5);
        if (label === "知識")
            return (_f = stats["知識"]) !== null && _f !== void 0 ? _f : multiplyStat(stats.EDU, 5);
    }
    return stats[label];
}
function multiplyStat(value, multiplier) {
    const num = numberOrNull(value);
    return num == null ? null : num * multiplier;
}
function calculate6thDamageBonus(strValue, sizValue) {
    const str = numberOrNull(strValue);
    const siz = numberOrNull(sizValue);
    if (str == null || siz == null)
        return null;
    const total = str + siz;
    if (total <= 12)
        return "-1D6";
    if (total <= 16)
        return "-1D4";
    if (total <= 24)
        return "+0";
    if (total <= 32)
        return "+1D4";
    if (total <= 40)
        return "+1D6";
    const dice = 2 + Math.floor((total - 41) / 16);
    return `+${dice}D6`;
}
function calculate7thDamageBonus(strValue, sizValue) {
    const str = numberOrNull(strValue);
    const siz = numberOrNull(sizValue);
    if (str == null || siz == null)
        return null;
    const total = str + siz;
    if (total <= 64)
        return "-2";
    if (total <= 84)
        return "-1";
    if (total <= 124)
        return "+0";
    if (total <= 164)
        return "+1D4";
    if (total <= 204)
        return "+1D6";
    const dice = 2 + Math.floor((total - 205) / 80);
    return `+${dice}D6`;
}
function calculate7thBuild(strValue, sizValue) {
    const str = numberOrNull(strValue);
    const siz = numberOrNull(sizValue);
    if (str == null || siz == null)
        return null;
    const total = str + siz;
    if (total <= 64)
        return -2;
    if (total <= 84)
        return -1;
    if (total <= 124)
        return 0;
    if (total <= 164)
        return 1;
    if (total <= 204)
        return 2;
    return 3 + Math.floor((total - 205) / 80);
}
function makeStatCell(label, value, derived = false) {
    const cell = document.createElement("div");
    cell.className = derived ? "stat-cell derived" : "stat-cell";
    const labelEl = document.createElement("span");
    labelEl.className = "stat-label";
    labelEl.textContent = label;
    const valueEl = document.createElement("strong");
    valueEl.className = "stat-value";
    valueEl.textContent = value === undefined || value === null || value === "" ? "—" : String(value);
    cell.append(labelEl, valueEl);
    return cell;
}
function getSingleSortRawValue(character, key) {
    var _a, _b;
    if (!key)
        return null;
    const [type, ...rest] = key.split(":");
    const name = rest.join(":");
    if (type === "skill")
        return numberOrNull((_a = character.skills) === null || _a === void 0 ? void 0 : _a[name]);
    if (type === "stat")
        return numberOrNull((_b = character.characteristics) === null || _b === void 0 ? void 0 : _b[name]);
    return null;
}
function formatSortDisplay(character, keys) {
    const list = Array.isArray(keys) ? keys : (keys ? [keys] : []);
    if (!list.length)
        return "—";
    return list.map((key) => {
        const value = getSingleSortRawValue(character, key);
        return value == null ? "—" : String(value);
    }).join(" / ");
}
function sortKeyLabel(key) {
    return String(key || "").split(":").slice(1).join(":") || "値";
}
function sortLabel(keys) {
    const list = Array.isArray(keys) ? keys : (keys ? [keys] : []);
    if (!list.length)
        return "値";
    return list.map(sortKeyLabel).join(" ");
}
function formatSortLabels(keys) {
    const list = Array.isArray(keys) ? keys : (keys ? [keys] : []);
    if (!list.length)
        return "値";
    return list.map(sortKeyLabel).join(" / ");
}
function extractDeclaredTextColor(...sources) {
    // Accepts examples such as:
    // 文字色 00ADA9 / 文字色 #00ADA9 / 文字色：00ADA9 / 芸術（文字色　00ADA9）
    const pattern = /文字色[^0-9A-Fa-f#]{0,16}#?([0-9A-Fa-f]{6})(?![0-9A-Fa-f])/u;
    for (const source of sources) {
        if (source == null)
            continue;
        let text = "";
        if (typeof source === "string") {
            text = source;
        }
        else {
            try {
                text = JSON.stringify(source);
            }
            catch {
                text = "";
            }
        }
        const match = text.match(pattern);
        if (match)
            return `#${match[1].toUpperCase()}`;
    }
    return null;
}
function normalizeHex(value) {
    let v = String(value || "").trim().toUpperCase();
    if (/^[0-9A-F]{6}$/.test(v))
        v = `#${v}`;
    return /^#[0-9A-F]{6}$/.test(v) ? v : null;
}
async function saveCharacters() {
    await chrome.storage.local.set({ [STORAGE_KEY]: characters });
}
function setBusy(busy) {
    document.getElementById("ccfolia6Btn").disabled = busy;
    document.getElementById("ccfolia7Btn").disabled = busy;
    ui.charaenoUrlAddBtn.disabled = busy;
    ui.charaenoUrlInput.disabled = busy;
    ui.json6Btn.disabled = busy;
    ui.json7Btn.disabled = busy;
    ui.jsonInput.disabled = busy;
    ui.backupExportBtn.disabled = busy;
    ui.backupImportBtn.disabled = busy;
}
function setMessage(text, type = "") {
    ui.message.textContent = text || "";
    ui.message.className = `message${type ? ` ${type}` : ""}`;
}
function humanizeError(error) {
    const text = String((error === null || error === void 0 ? void 0 : error.message) || error || "不明なエラー");
    if (/Failed to fetch/i.test(text))
        return "通信できませんでした";
    return text;
}
