/**
 * MatteDev AI - Sistema Completo
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
        console.log("Bro loggato:", user.email);
        if (currentPage.includes("index.html") || currentPage === "/") {
            // Se è loggato e sta sulla index, portalo in chat
            // window.location.href = "chat.html"; 
        }
    } else {
        if (currentPage.includes("chat.html")) {
            console.warn("Accesso negato, torna al login");
            window.location.href = "index.html";
        }
    }
});

// Funzione Login
window.login = async function() {
    const email = document.getElementById("email")?.value;
    const pass = document.getElementById("password")?.value;

    if (!email || !pass) return alert("Inserisci i dati, bro!");

    try {
        await signInWithEmailAndPassword(auth, email, pass);
        window.location.href = "chat.html";
    } catch (err) {
        console.error("Login fail:", err.code);
        alert("Errore: " + err.message);
    }
};

// Funzione Registrazione
window.register = async function() {
    const email = document.getElementById("email")?.value;
    const pass = document.getElementById("password")?.value;

    if (pass.length < 6) return alert("Password troppo corta, almeno 6 caratteri!");

    try {
        await createUserWithEmailAndPassword(auth, email, pass);
        alert("Account creato con successo! Ora effettua il login.");
    } catch (err) {
        alert("Errore reg: " + err.message);
    }
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

// Funzione principale di invio
window.handleSend = async function() {
    const input = document.getElementById("user-input");
    const chatContainer = document.getElementById("chat-container");
    
    if (!input || !chatContainer) return;

    const message = input.value.trim();
    if (!message) return;

    // 1. UI: Aggiungi messaggio utente e pulisci input
    appendMessage("user", message);
    input.value = "";
    
    // 2. UI: Mostra indicatore caricamento
    const loadingId = "loader-" + Date.now();
    const loadingDiv = appendMessage("ai", "...", loadingId);

    try {
        // 3. API: Chiamata al proxy
        const response = await fetch(PROXY_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: message })
        });

        if (!response.ok) throw new Error("Server non risponde");

        const data = await response.json();
        console.log("Dati ricevuti:", data);

        // 4. DATA: Estrazione testo
        let aiResponse = "Non ho capito, puoi ripetere?";
        
        if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
            aiResponse = data.candidates[0].content.parts[0].text;
        } else if (data.reply) {
            aiResponse = data.reply;
        }

        // 5. UI: Rimuovi loader e aggiungi risposta vera
        loadingDiv.remove();
        appendMessage("ai", aiResponse);

    } catch (error) {
        console.error("Chat Error:", error);
        loadingDiv.remove();
        appendMessage("error", "Bro, il server è esploso. Riprova tra poco.");
    }
};

// ==============================
// 4. UTILS & UI MODIFIERS
// ==============================

/**
 * Aggiunge un messaggio al box e gestisce lo scroll
 * @param {string} role - 'user', 'ai', o 'error'
 * @param {string} text - il contenuto del messaggio
 * @param {string} id - (opzionale) id univoco
 */
function appendMessage(role, text, id = null) {
    const container = document.getElementById("chat-container");
    const msgDiv = document.createElement("div");
    
    msgDiv.className = `msg-wrapper ${role}-wrapper`;
    if (id) msgDiv.id = id;

    // Configura marked per andare a capo con un singolo invio
    marked.setOptions({
        breaks: true,
        gfm: true
    });

    // Se è l'AI, formattiamo il Markdown. Se è l'utente, puliamo solo il testo.
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

// Gestione eventi tastiera
document.addEventListener("keydown", (e) => {
    // Se premo Invio e non sto usando lo Shift (per andare a capo)
    if (e.key === "Enter" && !e.shiftKey) {
        if (document.activeElement.id === "user-input") {
            e.preventDefault(); // Evita il newline nell'input
            window.handleSend();
        }
    }
});

console.log("MatteDev AI System: ONLINE 🚀");