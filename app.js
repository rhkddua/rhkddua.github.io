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
  apiKey: "여기에_apiKey",
  authDomain: "여기에_authDomain",
  projectId: "여기에_projectId",
  storageBucket: "여기에_storageBucket",
  messagingSenderId: "여기에_messagingSenderId",
  appId: "여기에_appId",
};

const ADMIN_EMAILS = ["admin@example.com"];
const GROUPS = ["1반", "2반", "3반", "4반", "5반", "6반", "7반", "영어전담", "과학전담"];
const EVENT_DOC_ID = "current";

const app = initializeApp(firebaseConfig);
const firebaseAuth = getAuth(app);
const db = getFirestore(app);

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const views = {
  auth: $("#authView"),
  admin: $("#adminView"),
  user: $("#userView"),
};

const state = {
  user: null,
  profile: null,
  event: null,
  responses: [],
  users: [],
  unsubscribers: [],
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

function isAdminUser(user) {
  return Boolean(user?.email && ADMIN_EMAILS.includes(user.email));
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

function currentResponse() {
  return state.responses.find((response) => response.userId === state.user?.uid) || null;
}

function renderEvent() {
  const headline = $("#eventHeadline");
  const details = $("#eventDetails");

  if (!state.event) {
    headline.textContent = "아직 등록된 회식 일정이 없습니다.";
    details.innerHTML = "";
    $("#attendanceStep").classList.add("hidden");
    $("#drinkStep").classList.add("hidden");
    $("#completeStep").classList.add("hidden");
    return;
  }

  headline.textContent = `${formatDate(state.event.date)} 회식`;
  details.innerHTML = `
    <dt>장소</dt><dd>${state.event.place}</dd>
    <dt>시간</dt><dd>${state.event.time}</dd>
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
        ? "음주 버튼을 누르겠다고 선택했습니다."
        : "음주 버튼을 누르지 않겠다고 선택했습니다."
      : "다음 기회에 참여하겠다고 선택했습니다.";

  $("#completeText").textContent = `${response.group} ${response.nickname}님의 응답: ${drinkText}`;
}

function renderAdmin() {
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

  $("#responseList").innerHTML =
    [...state.users]
      .sort((a, b) => `${a.group}${a.nickname}`.localeCompare(`${b.group}${b.nickname}`, "ko-KR"))
      .map((user) => {
        const response = state.responses.find((item) => item.userId === user.id);
        const badgeClass = response
          ? response.attendance === "attend"
            ? "attend"
            : "decline"
          : "pending";
        const label = response
          ? response.attendance === "attend"
            ? `참석 / 음주 ${response.drink === "yes" ? "누름" : "누르지 않음"}`
            : "다음 기회에"
          : "미응답";

        return `
          <div class="response-item">
            <div><strong>${user.group} ${user.nickname}</strong><span>${user.email}</span></div>
            <span class="badge ${badgeClass}">${label}</span>
          </div>
        `;
      })
      .join("") || `<p class="helper-text">아직 가입한 사용자가 없습니다.</p>`;
}

function subscribeToEvent() {
  const unsubscribe = onSnapshot(
    doc(db, "dinners", EVENT_DOC_ID),
    (snapshot) => {
      state.event = snapshot.exists() ? snapshot.data() : null;
      if (isAdminUser(state.user)) {
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
    doc(db, "responses", state.user.uid),
    (snapshot) => {
      state.responses = snapshot.exists()
        ? [{ id: snapshot.id, ...snapshot.data() }]
        : [];
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
  if (!state.user || !state.profile) return;

  await setDoc(doc(db, "responses", state.user.uid), {
    ...response,
    dinnerId: EVENT_DOC_ID,
    userId: state.user.uid,
    email: state.user.email,
    nickname: state.profile.nickname,
    group: state.profile.group,
    submittedAt: serverTimestamp(),
  });
}

async function handleSignedInUser(user) {
  clearSubscriptions();
  state.user = user;
  state.profile = null;
  state.event = null;
  state.responses = [];
  state.users = [];

  if (isAdminUser(user)) {
    state.profile = {
      nickname: "관리자",
      group: "관리자",
      role: "admin",
    };
    setView("admin", "관리자", "회식 일정 관리");
    subscribeToEvent();
    subscribeToAdminData();
    return;
  }

  const profileDoc = await getDoc(doc(db, "users", user.uid));

  if (!profileDoc.exists()) {
    await signOut(firebaseAuth);
    showNotice("사용자 정보가 없습니다. 다시 회원가입해 주세요.");
    return;
  }

  state.profile = profileDoc.data();
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
    const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
    await setDoc(doc(db, "users", credential.user.uid), {
      email,
      nickname,
      group,
      role: "teacher",
      createdAt: serverTimestamp(),
    });
    form.reset();
  } catch (error) {
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
    await signInWithEmailAndPassword(firebaseAuth, email, password);
  } catch (error) {
    showNotice(getFirebaseMessage(error));
  } finally {
    setBusy(form, false);
  }
});

$("#eventForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  clearNotice();

  if (!isAdminUser(state.user)) {
    showNotice("관리자만 회식 일정을 저장할 수 있습니다.");
    return;
  }

  await setDoc(doc(db, "dinners", EVENT_DOC_ID), {
    date: $("#eventDate").value,
    time: $("#eventTime").value,
    place: $("#eventPlace").value.trim(),
    updatedAt: serverTimestamp(),
    updatedBy: state.user.uid,
  });
  showNotice("회식 일정이 저장되었습니다.");
});

$("#resetResponses").addEventListener("click", async () => {
  if (!isAdminUser(state.user)) {
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
        await saveResponse({ attendance: "decline", drink: "no" });
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
    await deleteDoc(doc(db, "responses", state.user.uid));
  } catch (error) {
    showNotice(getFirebaseMessage(error));
  }
});

logoutButton.addEventListener("click", async () => {
  await signOut(firebaseAuth);
});

onAuthStateChanged(firebaseAuth, async (user) => {
  clearSubscriptions();

  if (!user) {
    state.user = null;
    state.profile = null;
    state.event = null;
    state.responses = [];
    state.users = [];
    setView("auth", "시작하기", "로그인 또는 회원가입");
    return;
  }

  try {
    await handleSignedInUser(user);
  } catch (error) {
    showNotice(getFirebaseMessage(error));
  }
});

