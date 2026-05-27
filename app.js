import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  // Firebase 콘솔에서 복사한 firebaseConfig 전체를 여기에 붙여 넣으세요.
  apiKey: "AIzaSyDeFXKZuh7WWg-pYByroRNczyuGboA8aiI",
  authDomain: "hj6-2026.firebaseapp.com",
  projectId: "hj6-2026",
  storageBucket: "hj6-2026.firebasestorage.app",
  messagingSenderId: "1074201806314",
  appId: "1:1074201806314:web:8a6fafd08197e11919de93",
};

const GROUPS = ["1반", "2반", "3반", "4반", "5반", "6반", "7반", "영어전담", "과학전담"];

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const views = {
  auth: $("#authView"),
  admin: $("#adminView"),
  user: $("#userView"),
};

const state = {
  authUser: null,
  profile: null,
  event: null,
  responses: [],
  users: [],
  unsubscribers: [],
  pendingSignupProfile: null,
};

const notice = $("#notice");
const logoutButton = $("#logoutButton");

function showNotice(message) {
  notice.textContent = message;
  notice.classList.remove("hidden");
}

function clearNotice() {
  notice.textContent = "";
  notice.classList.add("hidden");
}

function setBusy(form, isBusy) {
  form.querySelectorAll("button, input, select").forEach((element) => {
    element.disabled = isBusy;
  });
}

function setView(viewName, kicker, title) {
  Object.values(views).forEach((view) => view.classList.add("hidden"));
  views[viewName].classList.remove("hidden");
  $("#viewKicker").textContent = kicker;
  $("#viewTitle").textContent = title;
  logoutButton.classList.toggle("hidden", viewName === "auth");
  clearNotice();
}

function clearSubscriptions() {
  state.unsubscribers.forEach((unsubscribe) => unsubscribe());
  state.unsubscribers = [];
}

function isAdmin() {
  return state.profile?.role === "admin";
}

function getFirebaseMessage(error) {
  const messages = {
    "auth/email-already-in-use": "이미 가입된 이메일입니다.",
    "auth/invalid-email": "이메일 형식을 확인해 주세요.",
    "auth/invalid-credential": "이메일 또는 비밀번호를 확인해 주세요.",
    "auth/weak-password": "비밀번호는 6자리 이상이어야 합니다.",
    "permission-denied": "Firestore 권한을 확인해 주세요.",
  };

  return messages[error.code] || "요청을 처리하지 못했습니다. Firebase 설정을 확인해 주세요.";
}

function formatDate(dateValue) {
  if (!dateValue) return "";
  const date = new Date(`${dateValue}T00:00:00`);
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function sortByGroupAndName(a, b) {
  return `${a.group || ""}${a.nickname || ""}`.localeCompare(
    `${b.group || ""}${b.nickname || ""}`,
    "ko-KR",
  );
}

function currentResponse() {
  return state.responses.find((response) => response.userId === state.authUser?.uid) || null;
}

function renderEvent() {
  const headline = $("#eventHeadline");
  const details = $("#eventDetails");

  if (!state.event) {
    headline.textContent = "아직 등록된 회식 정보가 없습니다.";
    details.innerHTML = "";
    $("#attendanceStep").classList.add("hidden");
    $("#drinkStep").classList.add("hidden");
    $("#completeStep").classList.add("hidden");
    return;
  }

  headline.textContent = state.event.title || "회식";
  details.innerHTML = `
    <dt>날짜</dt><dd>${formatDate(state.event.date)}</dd>
    <dt>시간</dt><dd>${state.event.time || "-"}</dd>
    <dt>장소</dt><dd>${state.event.place || "-"}</dd>
  `;
  renderUserResponse();
}

function renderUserResponse() {
  const response = currentResponse();
  const hasEvent = Boolean(state.event);

  $("#attendanceStep").classList.toggle("hidden", !hasEvent || Boolean(response));
  $("#drinkStep").classList.add("hidden");
  $("#completeStep").classList.toggle("hidden", !response);

  if (!response) return;

  const drinkText =
    response.attendance === "attend"
      ? response.drink === "yes"
        ? "참석, 음주 버튼을 누르겠다고 선택했습니다."
        : "참석, 음주 버튼을 누르지 않겠다고 선택했습니다."
      : "다음 기회에 참여하겠다고 선택했습니다.";

  $("#completeText").textContent = `${response.group} ${response.nickname}님의 응답: ${drinkText}`;
}

function renderAdmin() {
  $("#eventTitle").value = state.event?.title || "";
  $("#eventDate").value = state.event?.date || "";
  $("#eventTime").value = state.event?.time || "";
  $("#eventPlace").value = state.event?.place || "";

  const attendCount = state.responses.filter((item) => item.attendance === "attend").length;
  const declineCount = state.responses.filter((item) => item.attendance === "decline").length;
  const drinkCount = state.responses.filter((item) => item.drink === "yes").length;

  $("#summaryGrid").innerHTML = `
    <div class="summary-item">참석<strong>${attendCount}</strong></div>
    <div class="summary-item">다음 기회에<strong>${declineCount}</strong></div>
    <div class="summary-item">음주 선택<strong>${drinkCount}</strong></div>
  `;

  const userMap = new Map(state.users.map((user) => [user.id, user]));
  const responseRows = [...state.responses]
    .map((response) => ({
      ...response,
      user: userMap.get(response.userId) || null,
    }))
    .sort((a, b) => sortByGroupAndName(a.user || a, b.user || b));

  $("#responseList").innerHTML =
    responseRows
      .map((response) => {
        const group = response.group || response.user?.group || "-";
        const nickname = response.nickname || response.user?.nickname || "알 수 없음";
        const email = response.email || response.user?.email || "";
        const label =
          response.attendance === "attend"
            ? `참석 / 음주 ${response.drink === "yes" ? "누름" : "누르지 않음"}`
            : "다음 기회에";
        const badgeClass = response.attendance === "attend" ? "attend" : "decline";

        return `
          <div class="response-item">
            <div>
              <strong>${group} ${nickname}</strong>
              <span class="response-meta">${email}</span>
            </div>
            <span class="badge ${badgeClass}">${label}</span>
          </div>
        `;
      })
      .join("") || `<p class="helper-text">아직 저장된 응답이 없습니다.</p>`;
}

function subscribeToEvent() {
  const unsubscribe = onSnapshot(
    doc(db, "events", "current"),
    (snapshot) => {
      state.event = snapshot.exists() ? snapshot.data() : null;
      if (isAdmin()) {
        renderAdmin();
      } else {
        renderEvent();
      }
    },
    (error) => showNotice(getFirebaseMessage(error)),
  );
  state.unsubscribers.push(unsubscribe);
}

function subscribeToCurrentResponse() {
  const unsubscribe = onSnapshot(
    doc(db, "responses", state.authUser.uid),
    (snapshot) => {
      state.responses = snapshot.exists() ? [{ id: snapshot.id, ...snapshot.data() }] : [];
      renderUserResponse();
    },
    (error) => showNotice(getFirebaseMessage(error)),
  );
  state.unsubscribers.push(unsubscribe);
}

function subscribeToAdminData() {
  state.unsubscribers.push(
    onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        state.users = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        renderAdmin();
      },
      (error) => showNotice(getFirebaseMessage(error)),
    ),
  );

  state.unsubscribers.push(
    onSnapshot(
      collection(db, "responses"),
      (snapshot) => {
        state.responses = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        renderAdmin();
      },
      (error) => showNotice(getFirebaseMessage(error)),
    ),
  );
}

async function saveResponse(response) {
  if (!state.authUser || !state.profile) return;

  const payload = {
    attendance: response.attendance,
    eventId: "current",
    userId: state.authUser.uid,
    email: state.authUser.email,
    nickname: state.profile.nickname,
    group: state.profile.group,
    submittedAt: serverTimestamp(),
  };

  if (response.attendance === "attend") {
    payload.drink = response.drink;
  }

  await setDoc(doc(db, "responses", state.authUser.uid), payload);
}

async function handleSignedInUser(authUser) {
  clearSubscriptions();
  state.authUser = authUser;
  state.profile = null;
  state.event = null;
  state.responses = [];
  state.users = [];

  const profileDoc = await getDoc(doc(db, "users", authUser.uid));

  if (!profileDoc.exists()) {
    if (state.pendingSignupProfile?.email === authUser.email) {
      await setDoc(doc(db, "users", authUser.uid), {
        ...state.pendingSignupProfile,
        role: "user",
        createdAt: serverTimestamp(),
      });
      state.profile = {
        id: authUser.uid,
        ...state.pendingSignupProfile,
        role: "user",
      };
      state.pendingSignupProfile = null;
    } else {
      await signOut(auth);
      setView("auth", "시작하기", "로그인 또는 회원가입");
      showNotice("사용자 정보가 없습니다. 다시 회원가입해 주세요.");
      return;
    }
  } else {
    state.profile = { id: profileDoc.id, ...profileDoc.data() };
    state.pendingSignupProfile = null;
  }

  if (!state.profile) {
    await signOut(auth);
    setView("auth", "시작하기", "로그인 또는 회원가입");
    showNotice("사용자 정보가 없습니다. 다시 회원가입해 주세요.");
    return;
  }

  if (isAdmin()) {
    setView("admin", "관리자", "회식 정보 관리");
    subscribeToEvent();
    subscribeToAdminData();
    return;
  }

  setView("user", state.profile.group, `${state.profile.nickname}님, 참여 여부를 선택해 주세요`);
  subscribeToEvent();
  subscribeToCurrentResponse();
}

$("#signupForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  clearNotice();

  const form = event.currentTarget;
  const email = $("#signupEmail").value.trim();
  const password = $("#signupPassword").value;
  const nickname = $("#signupNickname").value.trim();
  const group = $("#signupGroup").value;

  if (!GROUPS.includes(group)) {
    showNotice("소속을 선택해 주세요.");
    return;
  }

  setBusy(form, true);
  try {
    state.pendingSignupProfile = { email, nickname, group };
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, "users", credential.user.uid), {
      email,
      nickname,
      group,
      role: "user",
      createdAt: serverTimestamp(),
    });
    form.reset();
  } catch (error) {
    state.pendingSignupProfile = null;
    showNotice(getFirebaseMessage(error));
  } finally {
    setBusy(form, false);
  }
});

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  clearNotice();

  const form = event.currentTarget;
  const email = $("#loginEmail").value.trim();
  const password = $("#loginPassword").value;

  setBusy(form, true);
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    showNotice(getFirebaseMessage(error));
  } finally {
    setBusy(form, false);
  }
});

$("#eventForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  clearNotice();

  if (!isAdmin()) {
    showNotice("관리자만 회식 정보를 저장할 수 있습니다.");
    return;
  }

  await setDoc(doc(db, "events", "current"), {
    title: $("#eventTitle").value.trim(),
    date: $("#eventDate").value,
    time: $("#eventTime").value,
    place: $("#eventPlace").value.trim(),
    updatedAt: serverTimestamp(),
    updatedBy: state.authUser.uid,
  });
  showNotice("회식 정보가 저장되었습니다.");
});

$("#resetResponses").addEventListener("click", async () => {
  clearNotice();

  if (!isAdmin()) {
    showNotice("관리자만 응답을 초기화할 수 있습니다.");
    return;
  }

  const responsesSnapshot = await getDocs(collection(db, "responses"));
  await Promise.all(responsesSnapshot.docs.map((item) => deleteDoc(doc(db, "responses", item.id))));
  showNotice("응답 현황을 초기화했습니다.");
});

$$("[data-choice]").forEach((button) => {
  button.addEventListener("click", async () => {
    clearNotice();

    try {
      if (button.dataset.choice === "decline") {
        await saveResponse({ attendance: "decline" });
        return;
      }

      $("#attendanceStep").classList.add("hidden");
      $("#drinkStep").classList.remove("hidden");
    } catch (error) {
      showNotice(getFirebaseMessage(error));
    }
  });
});

$$("[data-drink]").forEach((button) => {
  button.addEventListener("click", async () => {
    clearNotice();

    try {
      await saveResponse({ attendance: "attend", drink: button.dataset.drink });
    } catch (error) {
      showNotice(getFirebaseMessage(error));
    }
  });
});

$("#editResponse").addEventListener("click", async () => {
  clearNotice();

  try {
    await deleteDoc(doc(db, "responses", state.authUser.uid));
  } catch (error) {
    showNotice(getFirebaseMessage(error));
  }
});

logoutButton.addEventListener("click", async () => {
  await signOut(auth);
});

onAuthStateChanged(auth, async (authUser) => {
  clearSubscriptions();

  if (!authUser) {
    state.authUser = null;
    state.profile = null;
    state.event = null;
    state.responses = [];
    state.users = [];
    setView("auth", "시작하기", "로그인 또는 회원가입");
    return;
  }

  try {
    await handleSignedInUser(authUser);
  } catch (error) {
    showNotice(getFirebaseMessage(error));
  }
});
