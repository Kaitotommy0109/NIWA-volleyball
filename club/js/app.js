// ============================================================
// club/js/app.js  (video.js の代わりに読み込む)
// ============================================================

// ★ Supabase の「Project URL」と「anon(publishable)キー」を貼る
// このキーは公開されても大丈夫な設計です。守っているのは setup.sql の RLS です。
const SUPABASE_URL = "https://isyxhicbwknnythfvbgc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_7ThsJ8z0l9M9u0nFsDWAOA_JaEusvbw";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const loginArea = document.getElementById("login-area");
const userBar   = document.getElementById("user-bar");
const postArea  = document.getElementById("post-area");
const videoArea = document.getElementById("video-area");

// 絞り込みバーは app.js が自分で作って、動画一覧の直前に置く(index.html の変更は不要)
const filterArea = document.createElement("div");
filterArea.id = "filter-area";
videoArea.before(filterArea);

let allVideos = [];                          // 取得した動画すべて
const filters = { q: "", month: "", mine: false };
let monthSelect = null;                      // 「月」の選択欄
let countEl = null;                          // 「○件」の表示

let me = null;     // ログイン中のユーザー
let myClub = null; // { club_id, role, clubs: { name } }

// ---------- 小さな部品 ----------
// 文字は append(文字列) で入れるので、悪意あるHTMLは無効化されます
function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  kids.forEach(c => e.append(c));
  return e;
}

function getYouTubeId(url) {
  const m = String(url).match(/(?:v=|youtu\.be\/|\/shorts\/|\/embed\/)([\w-]{11})/);
  return m ? m[1] : null;
}

function isYouTubeUrl(url) {
  return /^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(url);
}

function hideAll() {
  loginArea.replaceChildren();
  userBar.replaceChildren();
  filterArea.replaceChildren();
  postArea.replaceChildren();
  videoArea.replaceChildren();
  videoArea.style.display = "none";
}

const boxStyle = "max-width:360px;margin:0 auto;display:flex;flex-direction:column;gap:8px;padding:12px;";

// ---------- 画面1:ログイン / 新規登録 ----------
function showAuth() {
  hideAll();
  const msg = el("p", { style: "color:red;margin:0;" });
  const email = el("input", { type: "email", class: "form-control", placeholder: "メールアドレス", autocomplete: "email" });
  const pass  = el("input", { type: "password", class: "form-control", placeholder: "パスワード(8文字以上)", autocomplete: "current-password" });

  const loginBtn = el("button", {
    class: "btn btn-warning",
    onclick: async () => {
      msg.textContent = "";
      const { error } = await db.auth.signInWithPassword({ email: email.value.trim(), password: pass.value });
      if (error) msg.textContent = "ログインできませんでした。メールアドレスとパスワードを確認してください。";
      else start();
    }
  }, "ログイン");

  const signupBtn = el("button", {
    class: "btn btn-outline-secondary",
    onclick: async () => {
      msg.textContent = "";
      const { data, error } = await db.auth.signUp({ email: email.value.trim(), password: pass.value });
      if (error) msg.textContent = "登録できませんでした:" + error.message;
      else if (!data.session) msg.textContent = "確認メールを送りました。メール内のリンクを開いてから、ログインしてください。";
      else start();
    }
  }, "新規登録");

  loginArea.append(el("div", { style: boxStyle }, email, pass, loginBtn, signupBtn, msg));
}

// ---------- 画面2:合言葉で部活に参加 ----------
function showJoin() {
  hideAll();
  const msg = el("p", { style: "color:red;margin:0;" });
  const code = el("input", { type: "text", class: "form-control", placeholder: "部活の合言葉" });

  const joinBtn = el("button", {
    class: "btn btn-warning",
    onclick: async () => {
      msg.textContent = "";
      const { error } = await db.rpc("join_club", { code: code.value.trim() });
      if (error) msg.textContent = "合言葉が違います。";
      else start();
    }
  }, "参加する");

  const logoutBtn = el("button", { class: "btn btn-link", onclick: logout }, "ログアウト");
  loginArea.append(el("div", { style: boxStyle },
    el("p", { style: "margin:0;" }, "部活の合言葉を入力してください。"),
    code, joinBtn, msg, logoutBtn));
}

// ---------- 画面3:メイン(投稿フォーム + 動画一覧) ----------
function showMain() {
  hideAll();

  userBar.append(
    el("span", { style: "margin-right:8px;" }, `${myClub.clubs.name} / ${me.email}`),
    el("button", { class: "btn btn-sm btn-outline-secondary", onclick: logout }, "ログアウト")
  );

  // 投稿フォーム
  const title   = el("input", { type: "text", class: "form-control", placeholder: "タイトル(例:vs一宮南 第1セット)" });
  const url     = el("input", { type: "url", class: "form-control", placeholder: "YouTubeのURL" });
  const comment = el("input", { type: "text", class: "form-control", placeholder: "コメント(任意)" });
  const score   = el("input", { type: "text", class: "form-control", placeholder: "スコア(任意)" });
  const date    = el("input", { type: "date", class: "form-control" });
  const msg     = el("p", { style: "margin:0;" });

  const submit = el("button", {
    class: "btn btn-warning",
    onclick: async () => {
      msg.style.color = "red";
      msg.textContent = "";
      if (!title.value.trim()) { msg.textContent = "タイトルを入力してください。"; return; }
      if (!isYouTubeUrl(url.value.trim())) { msg.textContent = "YouTubeのURLを入力してください。"; return; }

      const { error } = await db.from("videos").insert({
        club_id: myClub.club_id,
        created_by: me.id,
        title: title.value.trim(),
        url: url.value.trim(),
        comment: comment.value.trim() || null,
        score: score.value.trim() || null,
        played_on: date.value || null
      });
      if (error) { msg.textContent = "投稿できませんでした:" + error.message; return; }

      [title, url, comment, score, date].forEach(i => (i.value = ""));
      msg.style.color = "green";
      msg.textContent = "投稿しました。";
      loadVideos();
    }
  }, "動画を投稿する");

  postArea.append(el("details", {},
    el("summary", { style: "cursor:pointer;margin-bottom:8px;" }, "動画を投稿する"),
    el("div", { style: "display:flex;flex-direction:column;gap:8px;" }, title, url, comment, score, date, submit, msg)
  ));

  // 絞り込みバー
  filters.q = ""; filters.month = ""; filters.mine = false;
  const q = el("input", { type: "search", class: "form-control", placeholder: "キーワードで探す(相手校・コメントなど。スペースで複数指定)" });
  monthSelect = el("select", { class: "form-select", style: "max-width:180px;" }, el("option", { value: "" }, "すべての月"));
  const mine = el("input", { type: "checkbox", id: "mine-only", class: "form-check-input" });
  countEl = el("p", { style: "margin:0;font-size:0.85rem;color:#666;text-align:center;" });

  q.addEventListener("input", () => { filters.q = q.value; render(); });
  monthSelect.addEventListener("change", () => { filters.month = monthSelect.value; render(); });
  mine.addEventListener("change", () => { filters.mine = mine.checked; render(); });

  filterArea.append(el("div", { style: "max-width:900px;margin:16px auto 8px;padding:0 12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;" },
    el("div", { style: "flex:1 1 260px;" }, q),
    monthSelect,
    el("div", { class: "form-check", style: "margin:0;" }, mine, el("label", { for: "mine-only", class: "form-check-label" }, "自分の投稿だけ"))
  ), countEl);

  videoArea.style.display = "grid";
  loadVideos();
}

// ---------- 動画カード ----------
function createCard(v) {
  const id = getYouTubeId(v.url);
  const card = el("div", { class: "item", style: "opacity:1;" }); // .item はCSSで opacity:0 のため上書き

  const openUrl = () => window.open(v.url, "_blank", "noopener");
  const placeholder = () => {
    const d = el("div", { style: "aspect-ratio:16/9;background:#333;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;" }, "▶ YouTubeで見る");
    d.addEventListener("click", openUrl);
    return d;
  };
  if (id) {
    const img = el("img", { src: `https://img.youtube.com/vi/${id}/hqdefault.jpg`, alt: "YouTubeを見る", style: "cursor:pointer;" });
    img.addEventListener("click", openUrl);
    img.addEventListener("error", () => img.replaceWith(placeholder()));
    card.append(img);
  } else {
    card.append(placeholder());
  }

  const content = el("div", { class: "item-content" });
  const add = (cls, text) => { if (text) content.append(el("p", { class: cls }, text)); };
  add("item-cat", v.title);
  add("item-text", v.comment);
  add("item-text", v.score);
  add("item-date", v.played_on);

  // 削除ボタン:投稿した本人か管理者だけに表示(サーバー側でも同じ条件でチェックされます)
  if (v.created_by === me.id || myClub.role === "admin") {
    content.append(el("button", {
      class: "btn btn-sm btn-outline-danger",
      onclick: async () => {
        if (!confirm("この動画を削除しますか?")) return;
        const { error } = await db.from("videos").delete().eq("id", v.id);
        if (error) alert("削除できませんでした:" + error.message);
        else loadVideos();
      }
    }, "削除"));
  }

  card.append(content);
  return card;
}

async function loadVideos() {
  const { data, error } = await db
    .from("videos")
    .select("*")
    .eq("club_id", myClub.club_id)
    .order("played_on", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) { videoArea.textContent = "動画を読み込めませんでした。"; return; }
  allVideos = data;
  updateMonthOptions();
  render();
}

// 試合日がある月だけを、選択肢に出す
function updateMonthOptions() {
  const months = [...new Set(allVideos.map(v => (v.played_on || "").slice(0, 7)).filter(Boolean))].sort().reverse();
  monthSelect.replaceChildren(
    el("option", { value: "" }, "すべての月"),
    ...months.map(m => el("option", { value: m }, m.replace("-", "年") + "月"))
  );
  monthSelect.value = months.includes(filters.month) ? filters.month : "";
  filters.month = monthSelect.value;
}

// 条件に合うか(キーワードは、スペース区切りで「すべて含む」)
function matches(v) {
  const words = filters.q.trim().toLowerCase().split(/[\s\u3000]+/).filter(Boolean);
  if (words.length) {
    const text = [v.title, v.comment, v.score].filter(Boolean).join(" ").toLowerCase();
    if (!words.every(w => text.includes(w))) return false;
  }
  if (filters.month && !(v.played_on || "").startsWith(filters.month)) return false;
  if (filters.mine && v.created_by !== me.id) return false;
  return true;
}

function render() {
  videoArea.replaceChildren();
  if (!allVideos.length) {
    countEl.textContent = "";
    videoArea.textContent = "まだ動画がありません。上のフォームから最初の1本を投稿しましょう。";
    return;
  }
  const list = allVideos.filter(matches);
  countEl.textContent = list.length === allVideos.length
    ? `${allVideos.length}件`
    : `${allVideos.length}件中 ${list.length}件を表示`;
  if (!list.length) { videoArea.textContent = "条件に合う動画がありません。"; return; }
  list.forEach(v => videoArea.append(createCard(v)));
}

// ---------- 起動 ----------
async function logout() {
  await db.auth.signOut();
  start();
}

async function start() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) return showAuth();
  me = session.user;

  const { data, error } = await db
    .from("members")
    .select("club_id, role, clubs(name)")
    .eq("user_id", me.id)
    .limit(1);

  if (error) { hideAll(); loginArea.textContent = "読み込みに失敗しました。ページを更新してください。"; return; }
  if (!data.length) return showJoin();

  myClub = data[0];
  showMain();
}

document.addEventListener("DOMContentLoaded", start);