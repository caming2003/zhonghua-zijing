const { ALL_SENTENCES, CATEGORIES, RAINBOW, getRandomColors, getCategoryForIndex } = require('../../utils/data');
const plugin = requirePlugin('WechatSI');

const STORAGE_KEY = 'zzj_state';

Page({
  data: {
    currentIndex: 0,
    progressPercent: 0,
    progressText: '0/0',
    categories: CATEGORIES.map(c => ({ ...c, active: false })),
    charItems: [],
    isGameMode: false,
    gameOptions: [],
    gameFeedback: '',
    gameAnswer: '',
    gameLocked: false,
    isFav: false,
    showFavPanel: false,
    favorites: [],
    showConfetti: false,
    showToast: false,
    toastChar: ''
  },

  /* ========== 存储 ========== */
  _completedSet: [],
  _confettiFired: false,

  _loadState() {
    try {
      const raw = wx.getStorageSync(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (typeof p.completedSet === 'string') p.completedSet = JSON.parse(p.completedSet);
        if (!Array.isArray(p.completedSet)) p.completedSet = [];
        this._completedSet = [...new Set(p.completedSet.map(Number).filter(n => !isNaN(n)))];
        return {
          currentIndex: p.currentIndex || 0,
          favorites: [...new Set(p.favorites || [])]
        };
      }
    } catch (e) {}
    return { currentIndex: 0, favorites: [] };
  },

  _saveState() {
    try {
      wx.setStorageSync(STORAGE_KEY, JSON.stringify({
        currentIndex: this.data.currentIndex,
        favorites: [...new Set(this.data.favorites.map(f => f.idx))],
        completedSet: [...new Set(this._completedSet)]
      }));
    } catch (e) {}
  },

  /* ========== 生命周期 ========== */
  onLoad() {
    const saved = this._loadState();
    const initial = { currentIndex: saved.currentIndex };
    if (initial.currentIndex >= ALL_SENTENCES.length) initial.currentIndex = 0;

    const favList = saved.favorites.map(idx => ({
      idx,
      text: ALL_SENTENCES[idx] || ''
    })).filter(f => f.text);

    this.setData({
      currentIndex: initial.currentIndex,
      favorites: favList
    });
    this._render();
  },

  /* ========== 渲染 ========== */
  _render() {
    const idx = this.data.currentIndex;
    const sentence = ALL_SENTENCES[idx];
    if (!sentence) return;

    const total = ALL_SENTENCES.length;
    const progressPercent = ((idx + 1) / total * 100);
    const progressText = `${idx + 1}/${total}`;

    // 分类高亮
    const categories = CATEGORIES.map(c => {
      const inRange = c.end === -1 ? idx >= c.start : (idx >= c.start && idx <= c.end);
      return { ...c, active: inRange };
    });

    // 是否收藏
    const favIdxList = this.data.favorites.map(f => f.idx);
    const isFav = favIdxList.includes(idx);

    const chars = sentence.split('');
    const colors = getRandomColors(chars.length);
    let charItems;
    let gameOptions = [];
    let gameFeedback = '';
    let gameAnswer = '';

    if (this.data.isGameMode && !this.data.gameLocked) {
      const blankIdx = Math.floor(Math.random() * chars.length);
      gameAnswer = chars[blankIdx];
      charItems = chars.map((ch, i) => ({
        char: ch,
        color: colors[i],
        blanked: i === blankIdx,
        idx: i
      }));

      // 生成选项
      gameOptions = this._genGameOptions(sentence, blankIdx, gameAnswer);
      gameFeedback = '🎯 选正确的字填进空格吧！';
    } else if (this.data.isGameMode && this.data.gameLocked) {
      // 锁定状态下保持上一轮的渲染
      return;
    } else {
      charItems = chars.map((ch, i) => ({
        char: ch,
        color: colors[i],
        blanked: false,
        idx: i
      }));
      gameOptions = [];
      gameFeedback = '';
      gameAnswer = '';
    }

    // 标记完成
    if (!this._completedSet.includes(idx)) {
      this._completedSet.push(idx);
      this._saveState();
      if (this._completedSet.length >= total && !this._confettiFired) {
        this._confettiFired = true;
        setTimeout(() => this._launchConfetti(), 400);
      }
    }

    this.setData({
      progressPercent,
      progressText,
      categories,
      charItems,
      isFav,
      gameOptions,
      gameFeedback,
      gameAnswer
    });
  },

  _genGameOptions(sentence, blankIdx, correct) {
    const distractors = new Set();
    const pool = [];
    for (const s of ALL_SENTENCES) {
      if (s !== sentence) for (const ch of s) if (ch !== correct && !pool.includes(ch)) pool.push(ch);
    }
    while (distractors.size < 3 && distractors.size < pool.length) {
      distractors.add(pool[Math.floor(Math.random() * pool.length)]);
    }
    const fallback = '天地人大小上下左右日月中水火木金土风云雨雪花草鸟虫鱼龙虎马牛羊';
    while (distractors.size < 3) {
      const ch = fallback[Math.floor(Math.random() * fallback.length)];
      if (ch !== correct) distractors.add(ch);
    }
    const all = [correct, ...distractors];
    // 洗牌
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    return all.map(ch => ({ char: ch, correct: false, wrong: false }));
  },

  /* ========== 导航 ========== */
  onPrev() {
    if (this.data.currentIndex > 0) {
      this.setData({ currentIndex: this.data.currentIndex - 1, isGameMode: false, gameLocked: false });
      this._render();
    }
  },
  onNext() {
    if (this.data.currentIndex < ALL_SENTENCES.length - 1) {
      this.setData({ currentIndex: this.data.currentIndex + 1, isGameMode: false, gameLocked: false });
      this._render();
    }
  },

  /* ========== 分类 ========== */
  onCategoryTap(e) {
    const start = e.currentTarget.dataset.start;
    this.setData({
      currentIndex: Math.min(start, ALL_SENTENCES.length - 1),
      isGameMode: false,
      gameLocked: false
    });
    this._render();
  },

  /* ========== TTS 语音合成 ========== */
  _speakText(text) {
    if (!text) return;
    plugin.textToSpeech({
      lang: 'zh_CN',
      tts: true,
      content: text,
      success: (res) => {
        const audio = wx.createInnerAudioContext();
        audio.src = res.filename;
        audio.play();
      },
      fail: (err) => {
        console.error('TTS 失败:', err);
        wx.showToast({ title: text, icon: 'none', duration: 1500 });
      }
    });
  },

  /* ========== 朗读(点击大字) ========== */
  onCharTap(e) {
    const char = e.currentTarget.dataset.char;
    if (!char) return;
    this._speakText(char);
  },
  onHideToast() {
    this.setData({ showToast: false });
  },

  onSpeak() {
    const sentence = ALL_SENTENCES[this.data.currentIndex];
    if (!sentence) return;
    this._speakText(sentence);
  },

  /* ========== 游戏 ========== */
  onToggleGame() {
    this.setData({
      isGameMode: !this.data.isGameMode,
      gameLocked: false,
      gameFeedback: this.data.isGameMode ? '' : '🎯 选正确的字填进空格吧！'
    });
    this._render();
  },

  onGameGuess(e) {
    if (this.data.gameLocked) return;
    const chosen = e.currentTarget.dataset.char;
    const correct = this.data.gameAnswer;

    if (chosen === correct) {
      // 正确
      const opts = this.data.gameOptions.map(o =>
        o.char === chosen ? { ...o, correct: true } : o
      );
      this.setData({
        gameOptions: opts,
        gameFeedback: '✅ 太棒了！答对了！',
        gameLocked: true
      });

      // 显示被隐藏的字
      const items = this.data.charItems.map(item =>
        item.blanked ? { ...item, blanked: false, char: correct, color: RAINBOW[Math.floor(Math.random() * RAINBOW.length)] } : item
      );
      this.setData({ charItems: items });

      setTimeout(() => {
        if (this.data.isGameMode) {
          this.setData({ gameLocked: false });
          this._render();
        }
      }, 1500);
    } else {
      // 错误
      const opts = this.data.gameOptions.map(o =>
        o.char === chosen ? { ...o, wrong: true } : o
      );
      this.setData({ gameOptions: opts, gameFeedback: '❌ 再想想哦～' });
      setTimeout(() => {
        if (this.data.isGameMode) {
          const reset = this.data.gameOptions.map(o => ({ ...o, wrong: false }));
          this.setData({ gameOptions: reset, gameFeedback: '🎯 选正确的字填进空格吧！' });
        }
      }, 600);
    }
  },

  /* ========== 收藏 ========== */
  onToggleFav() {
    const idx = this.data.currentIndex;
    const favs = [...this.data.favorites];
    const pos = favs.findIndex(f => f.idx === idx);
    if (pos >= 0) {
      favs.splice(pos, 1);
    } else {
      favs.push({ idx, text: ALL_SENTENCES[idx] });
    }
    this.setData({ favorites: favs, isFav: pos < 0 });
    this._saveState();
  },

  onShowFav() {
    this.setData({ showFavPanel: true });
  },
  onHideFav() {
    this.setData({ showFavPanel: false });
  },
  onGotoFav(e) {
    const idx = e.currentTarget.dataset.idx;
    this.setData({
      currentIndex: idx,
      showFavPanel: false,
      isGameMode: false,
      gameLocked: false
    });
    this._render();
  },

  /* ========== 撒花 ========== */
  _launchConfetti() {
    this.setData({ showConfetti: true });
    const query = wx.createSelectorQuery();
    query.select('#confetti-canvas').fields({ node: true, size: true }).exec(res => {
      if (!res[0] || !res[0].node) return;
      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      const dpr = wx.getSystemInfoSync().pixelRatio;
      canvas.width = res[0].width * dpr;
      canvas.height = res[0].height * dpr;
      ctx.scale(dpr, dpr);

      const w = res[0].width;
      const h = res[0].height;
      const colorList = ['#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#FF6B9D', '#C9B1FF', '#FFB347', '#A8E6CF'];
      const pieces = [];
      for (let i = 0; i < 200; i++) {
        pieces.push({
          x: Math.random() * w,
          y: Math.random() * h - h,
          w: Math.random() * 10 + 5,
          hh: Math.random() * 8 + 4,
          color: colorList[Math.floor(Math.random() * colorList.length)],
          vx: (Math.random() - 0.5) * 4,
          vy: Math.random() * 4 + 2,
          rot: Math.random() * 360,
          rotSp: (Math.random() - 0.5) * 10,
          op: 1
        });
      }
      let frames = 0;
      const anim = () => {
        ctx.clearRect(0, 0, w, h);
        let alive = false;
        for (const p of pieces) {
          if (p.op <= 0) continue;
          alive = true;
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.06;
          p.rot += p.rotSp;
          p.op -= 0.003;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot * Math.PI / 180);
          ctx.globalAlpha = Math.max(0, p.op);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.w / 2, -p.hh / 2, p.w, p.hh);
          ctx.restore();
        }
        frames++;
        if (alive && frames < 300) {
          canvas.requestAnimationFrame(anim);
        } else {
          ctx.clearRect(0, 0, w, h);
          this.setData({ showConfetti: false });
        }
      };
      canvas.requestAnimationFrame(anim);
    });
  }
});
