/**
 * MatteDev AI - Sistema Professionale
 * Backend: Render Proxy
 * Database: Firebase
 */

// ==============================
// 1. CONFIGURAZIONE & SETUP
// ==============================
const PROXY_URL = "https://mdev-ai-backend.onrender.com/chat";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    onAuthStateChanged,
    signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyC7Tbqt5FzJK8Z_USkCMWxXiHZp8uRN26A",
    authDomain: "mattedev-account.firebaseapp.com",
    projectId: "mattedev-account",
    storageBucket: "mattedev-account.firebasestorage.app",
    messagingSenderId: "77268069903",
    appId: "1:77268069903:web:040aa6c3981eb3650afd7a"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth();

// ==============================
// 2. GESTIONE AUTENTICAZIONE
// ==============================

// Listener stato utente
onAuthStateChanged(auth, (user) => {
    const currentPage = window.location.pathname;
    if (user) {
        console.log("Utente autenticato:", user.email);
        if (currentPage.includes("index.html") || currentPage === "/") {
            // Reindirizzamento opzionale alla chat se già loggato
        }
    } else {
        if (currentPage.includes("chat.html")) {
            console.warn("Sessione non valida. Reindirizzamento al login.");
            window.location.href = "index.html";
        }
    }
});

// Funzione Login
window.login = async function() {
    const email = document.getElementById("email")?.value;
    const pass = document.getElementById("password")?.value;

    if (!email || !pass) return alert("Inserire le credenziali di accesso.");

    try {
        await signInWithEmailAndPassword(auth, email, pass);
        window.location.href = "chat.html";
    } catch (err) {
        console.error("Errore autenticazione:", err.code);
        alert("Errore durante il login: " + err.message);
    }
};

// Funzione Registrazione
window.register = async function() {
    window.location.href = "https://account.mattedev.com/login.html#registrazione";
};

// Funzione Logout
window.logout = function() {
    signOut(auth).then(() => {
        window.location.href = "../index.html";
    });
};

// ==============================
// 3. CORE CHAT SYSTEM
// ==============================

window.handleSend = async function() {
    const input = document.getElementById("user-input");
    const chatContainer = document.getElementById("chat-container");
    
    if (!input || !chatContainer) return;

    const message = input.value.trim();
    if (!message) return;

    // 1. UI: Aggiungi messaggio utente
    appendMessage("user", message);
    input.value = "";
    
    // 2. UI: Indicatore caricamento
    const loadingId = "loader-" + Date.now();
    const loadingDiv = appendMessage("ai", "Elaborazione in corso...", loadingId);

    try {
        // 3. API: Chiamata al proxy
        const response = await fetch(PROXY_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: message })
        });

        if (!response.ok) throw new Error("Risposta del server non valida");

        const data = await response.json();

        // 4. DATA: Estrazione testo
        let aiResponse = "Impossibile elaborare la richiesta. Riprovare.";
        
        if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
            aiResponse = data.candidates[0].content.parts[0].text;
        } else if (data.reply) {
            aiResponse = data.reply;
        }

        // 5. UI: Sostituzione loader con risposta definitiva
        loadingDiv.remove();
        appendMessage("ai", aiResponse);

    } catch (error) {
        console.error("Errore di sistema:", error);
        loadingDiv.remove();
        appendMessage("error", "Errore di connessione. Verificare lo stato del server e riprovare.");
    }
};

// ==============================
// 4. UTILS & UI MODIFIERS
// ==============================

function appendMessage(role, text, id = null) {
    const container = document.getElementById("chat-container");
    const msgDiv = document.createElement("div");
    
    msgDiv.className = `msg-wrapper ${role}-wrapper`;
    if (id) msgDiv.id = id;

    marked.setOptions({
        breaks: true,
        gfm: true
    });

    const content = role === "ai" ? marked.parse(text) : text;

    msgDiv.innerHTML = `
        <div class="msg-bubble">
            <div class="msg-text">${content}</div>
        </div>
    `;

    container.appendChild(msgDiv);
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });

    return msgDiv;
}

document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        if (document.activeElement.id === "user-input") {
            e.preventDefault();
            window.handleSend();
        }
    }
});

console.log("MatteDev AI System: ONLINE");