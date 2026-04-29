import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyC7Tbqt5FzJK8Z_USkCMWxXiHZp8uRN26A",
  authDomain: "mattedev-account.firebaseapp.com",
  databaseURL: "https://mattedev-account-default-rtdb.firebaseio.com",
  projectId: "mattedev-account",
  storageBucket: "mattedev-account.firebasestorage.app",
  messagingSenderId: "77268069903",
  appId: "1:77268069903:web:040aa6c3981eb3650afd7a"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const DISABLED_REDIRECT_URL = "https://account.mattedev.com/account-disabled.html";

function isUserDisabledError(error) {
  const errorCode = typeof error?.code === "string" ? error.code : "";
  const errorMessage = typeof error?.message === "string" ? error.message : "";

  return (
    errorCode === "auth/user-disabled" ||
    errorMessage.includes("auth/user-disabled")
  );
}

function redirectToDisabledPage() {
  window.location.assign(DISABLED_REDIRECT_URL);
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    window.location.href = "chat.html";
  }
});

window.login = async function login() {
  const email = document.getElementById("email")?.value.trim();
  const password = document.getElementById("password")?.value;

  if (!email || !password) {
    alert("Inserisci email e password.");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
    window.location.href = "chat.html";
  } catch (error) {
    if (isUserDisabledError(error)) {
      redirectToDisabledPage();
      return;
    }

    console.error("Login fallito:", error);
    alert("Errore login: " + error.message);
  }
};

window.register = async function register() {
  const email = document.getElementById("email")?.value.trim();
  const password = document.getElementById("password")?.value;

  if (!email || !password) {
    alert("Inserisci email e password.");
    return;
  }

  if (password.length < 6) {
    alert("La password deve avere almeno 6 caratteri.");
    return;
  }

  try {
    await createUserWithEmailAndPassword(auth, email, password);
    window.location.href = "chat.html";
  } catch (error) {
    if (isUserDisabledError(error)) {
      redirectToDisabledPage();
      return;
    }

    console.error("Registrazione fallita:", error);
    alert("Errore registrazione: " + error.message);
  }
};
