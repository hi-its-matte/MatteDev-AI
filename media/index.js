import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  collection,
  query,
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const DEFAULT_PROXY_URL = "https://mdev-ai-backend.onrender.com/chat";
const PROXY_URL = window.__CHAT_API_URL__ || DEFAULT_PROXY_URL;

const firebaseConfig = {
  apiKey: "AIzaSyC7Tbqt5FzJK8Z_USkCMWxXiHZp8uRN26A",
  authDomain: "mattedev-account.firebaseapp.com",
  projectId: "mattedev-account",
  storageBucket: "mattedev-account.firebasestorage.app",
  messagingSenderId: "77268069903",
  appId: "1:77268069903:web:040aa6c3981eb3650afd7a"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let currentTheme = "dark";

let currentSettings = {
  aiStyle: "normal",
  aiTone: "balanced",
  theme: "dark",
  memoryNote: ""
};

if (typeof window.marked !== "undefined") {
  window.marked.setOptions({
    breaks: true,
    gfm: true
  });
}

function stateDocRef(uid) {
  return doc(db, "users", uid, "ai", "state");
}

function chatHistoryColRef(uid) {
  return collection(db, "users", uid, "ai", "state", "chatHistory");
}

function personalizationDocRef(uid) {
  return doc(db, "users", uid, "ai", "state", "personalization", "profile");
}

function preferencesDocRef(uid) {
  return doc(db, "users", uid, "ai", "state", "preferences", "profile");
}

function contextMemoryDocRef(uid) {
  return doc(db, "users", uid, "ai", "state", "contextMemory", "general");
}

function fmtTime(value) {
  if (!value) return "";
  const date = new Date(value);
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function setTheme(theme) {
  currentTheme = theme === "light" ? "light" : "dark";
  document.body.dataset.theme = currentTheme;
}

function ensureUIExists() {
  return Boolean(
    document.getElementById("chat-container") &&
    document.getElementById("history-list")
  );
}

async function ensureAiState(uid) {
  await setDoc(
    stateDocRef(uid),
    {
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    { merge: true }
  );
}

async function loadSettingsFromFirestore() {

  if (!currentUser) return;

  const [personalSnap, prefSnap, memorySnap] = await Promise.all([
    getDoc(personalizationDocRef(currentUser.uid)),
    getDoc(preferencesDocRef(currentUser.uid)),
    getDoc(contextMemoryDocRef(currentUser.uid))
  ]);

  const personalData = personalSnap.exists() ? personalSnap.data() : {};
  const prefData = prefSnap.exists() ? prefSnap.data() : {};
  const memoryData = memorySnap.exists() ? memorySnap.data() : {};

  currentSettings = {
    aiStyle: personalData.aiStyle || "normal",
    aiTone: personalData.aiTone || "balanced",
    theme: prefData.theme || "dark",
    memoryNote: memoryData.note || ""
  };

  setTheme(currentSettings.theme);

  const styleEl = document.getElementById("ai-style");
  const toneEl = document.getElementById("ai-tone");
  const themeEl = document.getElementById("theme");
  const memoryEl = document.getElementById("memory-note");

  if (styleEl) styleEl.value = currentSettings.aiStyle;
  if (toneEl) toneEl.value = currentSettings.aiTone;
  if (themeEl) themeEl.value = currentSettings.theme;
  if (memoryEl) memoryEl.value = currentSettings.memoryNote;
}

async function loadHistory() {

  if (!currentUser || !ensureUIExists()) return;

  const historyList = document.getElementById("history-list");
  historyList.innerHTML = "";

  const q = query(
    chatHistoryColRef(currentUser.uid),
    orderBy("createdAt", "desc"),
    limit(30)
  );

  const snap = await getDocs(q);

  if (snap.empty) {
    historyList.innerHTML =
      `<div class="empty-state">Nessuna cronologia salvata.</div>`;
    return;
  }

  snap.forEach((d) => {

    const data = d.data();

    const item = document.createElement("button");
    item.className = "history-item glass-panel";

    const userText = String(data.userMessage || "");
    const preview =
      userText.length > 42
        ? `${userText.slice(0, 42)}…`
        : userText;

    item.innerHTML = `
      <div class="history-item-title">${preview}</div>
      <div class="history-item-meta">${fmtTime(data.createdAt)}</div>
    `;

    item.onclick = () => {
      openHistoryModal(
        data.userMessage,
        data.aiMessage,
        data.createdAt
      );
    };

    historyList.appendChild(item);

  });
}

function openHistoryModal(userMessage, aiMessage, createdAt) {

  const modal = document.getElementById("history-modal");
  const meta = document.getElementById("history-detail-meta");
  const body = document.getElementById("history-detail-body");

  if (!modal) return;

  meta.textContent = fmtTime(createdAt);

  body.innerHTML = `
    <div class="history-bubble user-bubble">
      <div class="bubble-label">Utente</div>
      <div class="bubble-content">${userMessage}</div>
    </div>

    <div class="history-bubble ai-bubble">
      <div class="bubble-label">AI</div>
      <div class="bubble-content">
        ${window.marked ? marked.parse(aiMessage) : aiMessage}
      </div>
    </div>
  `;

  modal.classList.add("open");
}

window.closeHistoryModal = function () {
  const modal = document.getElementById("history-modal");
  if (modal) modal.classList.remove("open");
};

window.toggleSidebar = function () {

  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");

  if (!sidebar || !overlay) return;

  sidebar.classList.toggle("open");
  overlay.classList.toggle("open");

};

window.openSettings = async function () {

  const modal = document.getElementById("settings-modal");
  if (!modal) return;

  await loadSettingsFromFirestore();

  modal.classList.add("open");

};

window.closeSettings = function () {

  const modal = document.getElementById("settings-modal");
  if (modal) modal.classList.remove("open");

};

window.logout = async function () {

  await signOut(auth);
  window.location.href = "login.html";

};

window.saveSettings = async function () {

  if (!currentUser) return;

  const aiStyle =
    document.getElementById("ai-style")?.value || "normal";

  const aiTone =
    document.getElementById("ai-tone")?.value || "balanced";

  const theme =
    document.getElementById("theme")?.value || "dark";

  const memoryNote =
    document.getElementById("memory-note")?.value || "";

  await Promise.all([
    setDoc(personalizationDocRef(currentUser.uid),
      { aiStyle, aiTone, updatedAt: Date.now() },
      { merge: true }),

    setDoc(preferencesDocRef(currentUser.uid),
      { theme, updatedAt: Date.now() },
      { merge: true }),

    setDoc(contextMemoryDocRef(currentUser.uid),
      { note: memoryNote, updatedAt: Date.now() },
      { merge: true })
  ]);

  currentSettings = { aiStyle, aiTone, theme, memoryNote };

  setTheme(theme);

  closeSettings();

};

async function saveChatMessage(userMessage, aiMessage) {

  if (!currentUser) return;

  await addDoc(
    chatHistoryColRef(currentUser.uid),
    {
      userMessage,
      aiMessage,
      createdAt: Date.now()
    }
  );

}

function appendMessage(role, text, id = null) {

  const container = document.getElementById("chat-container");
  if (!container) return;

  const wrapper = document.createElement("div");

  wrapper.className = `msg-wrapper ${role}-wrapper`;
  if (id) wrapper.id = id;

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";

  const content = document.createElement("div");
  content.className = "msg-text";

  if (role === "ai") {
    content.innerHTML =
      window.marked
        ? marked.parse(text)
        : text;
  } else {
    content.textContent = text;
  }

  bubble.appendChild(content);
  wrapper.appendChild(bubble);

  container.appendChild(wrapper);

  container.scrollTop = container.scrollHeight;

  return wrapper;

}

window.handleSend = async function () {

  if (!currentUser) return;

  const input = document.getElementById("user-input");

  const message = input.value.trim();
  if (!message) return;

  appendMessage("user", message);

  input.value = "";

  const loading = appendMessage(
    "ai",
    "Elaborazione in corso..."
  );

  try {

    const response = await fetch(PROXY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message,
        uid: currentUser.uid,
        settings: currentSettings
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    const aiResponse =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ??
      data?.reply ??
      data?.message ??
      "Errore AI";

    loading.remove();

    appendMessage("ai", aiResponse);

    await saveChatMessage(message, aiResponse);

    await loadHistory();

  }
  catch (err) {

    loading.remove();

    const isCorsOrNetworkError =
      err instanceof TypeError &&
      /fetch|network|load failed/i.test(err.message);

    appendMessage(
      "ai",
      isCorsOrNetworkError
        ? "Errore di connessione/CORS verso il backend. Verifica CORS sul server o configura un proxy stesso dominio."
        : `Errore di sistema: ${err.message}`
    );

    console.error("Errore di sistema:", err);

  }

};

onAuthStateChanged(auth, async (user) => {

  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  await ensureAiState(user.uid);

  await loadSettingsFromFirestore();

  await loadHistory();

});

document.addEventListener("keydown", (e) => {

  if (e.key === "Escape") {

    closeSettings();
    closeHistoryModal();

  }

  if (e.key === "Enter" && !e.shiftKey) {

    if (document.activeElement?.id === "user-input") {

      e.preventDefault();
      handleSend();

    }

  }

});