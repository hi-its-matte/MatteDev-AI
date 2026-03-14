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

const PROXY_URL = "https://mdev-ai-backend.onrender.com/chat";

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

if (window.marked) {
  marked.setOptions({
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
  const date = typeof value === "number" ? new Date(value) : new Date(value);
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

  const styleEl = document.getElementById("ai-style");
  const toneEl = document.getElementById("ai-tone");
  const themeEl = document.getElementById("theme");
  const memoryEl = document.getElementById("memory-note");

  if (styleEl) styleEl.value = currentSettings.aiStyle;
  if (toneEl) toneEl.value = currentSettings.aiTone;
  if (themeEl) themeEl.value = currentSettings.theme;
  if (memoryEl) memoryEl.value = currentSettings.memoryNote;

  setTheme(currentSettings.theme);
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
    historyList.innerHTML = `<div class="empty-state">Nessuna cronologia salvata.</div>`;
    return;
  }

  snap.forEach((d) => {
    const data = d.data();
    const item = document.createElement("button");
    item.type = "button";
    item.className = "history-item glass-panel";

    const userText = String(data.userMessage || "").trim();
    const aiText = String(data.aiMessage || "").trim();
    const preview = userText.length > 42 ? `${userText.slice(0, 42)}…` : userText;

    item.innerHTML = `
      <div class="history-item-title">${preview || "Messaggio senza testo"}</div>
      <div class="history-item-meta">${fmtTime(data.createdAt)}</div>
    `;

    item.addEventListener("click", () => {
      openHistoryModal(userText, aiText, data.createdAt);
    });

    historyList.appendChild(item);
  });
}

function openHistoryModal(userMessage, aiMessage, createdAt) {
  const modal = document.getElementById("history-modal");
  const meta = document.getElementById("history-detail-meta");
  const body = document.getElementById("history-detail-body");

  if (!modal || !meta || !body) return;

  meta.textContent = fmtTime(createdAt) || "Conversazione salvata";
  body.innerHTML = `
    <div class="history-bubble user-bubble">
      <div class="bubble-label">Utente</div>
      <div class="bubble-content"></div>
    </div>
    <div class="history-bubble ai-bubble">
      <div class="bubble-label">AI</div>
      <div class="bubble-content ai-content"></div>
    </div>
  `;

  const userContent = body.querySelector(".user-bubble .bubble-content");
  const aiContent = body.querySelector(".ai-bubble .bubble-content");

  if (userContent) userContent.textContent = userMessage || "";
  if (aiContent) {
    if (window.marked) {
      aiContent.innerHTML = marked.parse(aiMessage || "");
    } else {
      aiContent.textContent = aiMessage || "";
    }
  }

  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

window.closeHistoryModal = function closeHistoryModal() {
  const modal = document.getElementById("history-modal");
  if (!modal) return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
};

window.toggleSidebar = function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");

  if (!sidebar || !overlay) return;

  sidebar.classList.toggle("open");
  overlay.classList.toggle("open");
};

window.openSettings = async function openSettings() {
  const modal = document.getElementById("settings-modal");
  if (!modal) return;

  await loadSettingsFromFirestore();
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
};

window.closeSettings = function closeSettings() {
  const modal = document.getElementById("settings-modal");
  if (!modal) return;

  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
};

window.logout = async function logout() {
  try {
    await signOut(auth);
    window.location.href = "login.html";
  } catch (error) {
    console.error("Logout fallito:", error);
    alert("Errore durante il logout.");
  }
};

window.saveSettings = async function saveSettings() {
  if (!currentUser) return;

  const aiStyle = document.getElementById("ai-style")?.value || "normal";
  const aiTone = document.getElementById("ai-tone")?.value || "balanced";
  const theme = document.getElementById("theme")?.value || "dark";
  const memoryNote = document.getElementById("memory-note")?.value.trim() || "";

  try {
    await Promise.all([
      setDoc(
        personalizationDocRef(currentUser.uid),
        {
          aiStyle,
          aiTone,
          updatedAt: Date.now()
        },
        { merge: true }
      ),
      setDoc(
        preferencesDocRef(currentUser.uid),
        {
          theme,
          updatedAt: Date.now()
        },
        { merge: true }
      ),
      setDoc(
        contextMemoryDocRef(currentUser.uid),
        {
          note: memoryNote,
          updatedAt: Date.now()
        },
        { merge: true }
      )
    ]);

    currentSettings = { aiStyle, aiTone, theme, memoryNote };
    setTheme(theme);
    closeSettings();
  } catch (error) {
    console.error("Errore salvataggio impostazioni:", error);
    alert("Errore durante il salvataggio delle impostazioni.");
  }
};

async function saveChatMessage(userMessage, aiMessage) {
  if (!currentUser) return;

  await addDoc(chatHistoryColRef(currentUser.uid), {
    userMessage,
    aiMessage,
    createdAt: Date.now(),
    theme: currentTheme,
    aiStyle: currentSettings.aiStyle,
    aiTone: currentSettings.aiTone
  });
}

function appendMessage(role, text, id = null) {
  const container = document.getElementById("chat-container");
  if (!container) return null;

  const wrapper = document.createElement("div");
  wrapper.className = `msg-wrapper ${role}-wrapper`;
  if (id) wrapper.id = id;

  const bubble = document.createElement("div");
  bubble.className = `msg-bubble ${role}-bubble`;

  const content = document.createElement("div");
  content.className = "msg-text";

  if (role === "ai") {
    content.innerHTML = window.marked ? marked.parse(text) : text;
  } else {
    content.textContent = text;
  }

  bubble.appendChild(content);
  wrapper.appendChild(bubble);
  container.appendChild(wrapper);
  container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });

  return wrapper;
}

window.handleSend = async function handleSend() {
  if (!currentUser) {
    alert("Sessione non valida. Effettua di nuovo l'accesso.");
    window.location.href = "login.html";
    return;
  }

  const input = document.getElementById("user-input");
  if (!input) return;

  const message = input.value.trim();
  if (!message) return;

  appendMessage("user", message);
  input.value = "";

  const loadingId = `loading-${Date.now()}`;
  const loadingNode = appendMessage("ai", "Elaborazione in corso…", loadingId);

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
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    let aiResponse = "Impossibile elaborare la richiesta.";
    if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      aiResponse = data.candidates[0].content.parts[0].text;
    } else if (typeof data?.reply === "string") {
      aiResponse = data.reply;
    } else if (typeof data?.message === "string") {
      aiResponse = data.message;
    }

    if (loadingNode) loadingNode.remove();
    appendMessage("ai", aiResponse);
    await saveChatMessage(message, aiResponse);
    await loadHistory();
  } catch (error) {
    console.error("Errore chat:", error);
    if (loadingNode) loadingNode.remove();
    appendMessage("ai", "Errore di connessione. Verifica il server e riprova.");
  }
};

onAuthStateChanged(auth, async (user) => {
  const currentPage = window.location.pathname;

  if (!user) {
    if (currentPage.includes("chat.html") || currentPage.endsWith("/")) {
      window.location.href = "login.html";
    }
    return;
  }

  currentUser = user;

  try {
    await ensureAiState(user.uid);
    await loadSettingsFromFirestore();
    await loadHistory();
  } catch (error) {
    console.error("Errore inizializzazione AI:", error);
    alert("Errore nell'inizializzazione dei dati utente.");
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeSettings();
    closeHistoryModal();
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebar-overlay");
    if (sidebar) sidebar.classList.remove("open");
    if (overlay) overlay.classList.remove("open");
  }

  if (e.key === "Enter" && !e.shiftKey) {
    const active = document.activeElement;
    if (active && active.id === "user-input") {
      e.preventDefault();
      window.handleSend();
    }
  }
});