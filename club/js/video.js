

const GAS_URL = "https://script.google.com/macros/s/AKfycby6n19BewE09lpR8F1rNLxgyAoVmXptgDsTAXMrJVkSAgbHHXPTTmmhac7KhM_G2-yvxQ/exec";
const FALLBACK_IMG = "club/images/feature3.jpg";

function getYouTubeId(url) {
  const m = String(url).match(/(?:v=|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

function addText(parent, className, text) {
  if (!text) return;
  const p = document.createElement("p");
  p.className = className;
  p.textContent = text; // textContentで入れて、悪意あるHTMLを無効化
  parent.appendChild(p);
}

function createCard(v) {
  // YouTube以外のURL(javascript: など)は表示しない
  if (!/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(v.url)) return null;

  const id = getYouTubeId(v.url);
  const card = document.createElement("div");
  card.className = "item";
  card.style.opacity = 1; // .item はCSSで opacity:0 のため上書き

  const img = document.createElement("img");
  img.src = id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : FALLBACK_IMG;
  img.alt = "YouTubeを見る";
  img.style.cursor = "pointer";
  img.addEventListener("click", () => window.open(v.url, "_blank", "noopener"));
  card.appendChild(img);

  const content = document.createElement("div");
  content.className = "item-content";
  addText(content, "item-cat", v.title);
  addText(content, "item-text", v.comment);
  addText(content, "item-text", v.score);
  addText(content, "item-date", v.date);
  card.appendChild(content);

  return card;
}

async function loadVideos() {
  const area = document.getElementById("video-area");
  if (!area) return;

  try {
    const res = await fetch(GAS_URL);
    const videos = await res.json();
    videos.forEach(v => {
      const card = createCard(v);
      if (card) area.appendChild(card);
    });
  } catch (err) {
    console.error("読み込み失敗", err);
    area.textContent = "動画を読み込めませんでした。";
  }
}

loadVideos();