export const symbols: Record<
  string,
  { symbol: string; name: string; explanation: string; practice: string }
> = {
  fingering: {
    symbol: "1·2·3·4·5",
    name: "指法",
    explanation:
      "两只手都是：1 拇指、2 食指、3 中指、4 无名指、5 小指。指法数字不是音高，也不是力度。",
    practice:
      "先慢速试弹，确认换指顺畅、手腕放松。点击音符可以补充自己的指法；身体不适时停下来调整。",
  },
  clef: {
    symbol: "𝄞 𝄢",
    name: "高音谱号与低音谱号",
    explanation:
      "高音谱号的中心绕在第二线上，这条线是 G4；低音谱号两点夹住第四线，这条线是 F3。钢琴通常上谱表由右手弹、下谱表由左手弹，但并非绝对。",
    practice: "以中央 C（C4）为参照，先说出音名，再找琴键。",
  },
  accidental: {
    symbol: "♯ ♭ ♮",
    name: "临时升降记号",
    explanation:
      "♯ 升高半音，♭ 降低半音，♮ 还原。临时记号通常影响本小节同音名、同八度的后续音；跨小节延音线另有延续关系。",
    practice:
      "弹之前先看调号，再检查本小节的临时记号。黑键并不总是升音，白键也可能有升降记号。",
  },
  key: {
    symbol: "♭♭ / ♯♯",
    name: "调号",
    explanation:
      "谱号之后成组出现的升降号规定整段音乐的默认升降音，适用于各个八度，直到调号改变。",
    practice:
      "先找出调号涉及哪些音，再慢练相应音阶。只有调号还不足以唯一判断大小调。",
  },
  time: {
    symbol: "4/4 · 6/8",
    name: "拍号",
    explanation:
      "分子表示每小节包含多少个分母所指定的音符单位。例如 4/4 为四个四分音符；6/8 常按两组附点四分音符感受。速度标记的拍单位也要一起看。",
    practice: "先拍手数拍，再弹音高。复拍子注意分组重音。",
  },
  tied: {
    symbol: "⌒",
    name: "延音线",
    explanation: "连接相同音高的延音线把两个时值合起来。后一个音不重新击键。",
    practice:
      "保持前一个琴键到整条延音结束。本页跟弹把连在一起的同音计为一次击键。",
  },
  slur: {
    symbol: "︵",
    name: "连奏线",
    explanation:
      "跨越不同音高的弧线常表示连奏或乐句。它与同音之间的延音线不同。",
    practice: "让旋律自然衔接，用手指连接音与音；不要一味用踏板掩盖断音。",
  },
  staccato: {
    symbol: "·",
    name: "跳音",
    explanation: "音符上方或下方的点表示短促、分离地演奏；并不意味着用力敲击。",
    practice: "慢速轻巧弹起，保留每个音之间的空隙。具体时长取决于风格和乐句。",
  },
  tenuto: {
    symbol: "—",
    name: "保持音",
    explanation: "短横线表示把音的时值弹充分，或适度强调这个音。",
    practice: "稳定支撑手指，保持时值，不额外拉长到破坏节奏。",
  },
  accent: {
    symbol: ">",
    name: "重音",
    explanation: "音符旁的 > 表示这个音需要相对突出。",
    practice: "先让周围的音轻一些，再给重音适当重量；避免手腕僵硬。",
  },
  dynamics: {
    symbol: "p · mf · f",
    name: "力度",
    explanation:
      "pp 很弱，p 弱，mp 中弱，mf 中强，f 强，ff 很强。它们是相对的音乐表达，不是固定音量。",
    practice:
      "让旋律略突出、伴奏轻一些。本页音源使用三个力度层的真实钢琴采样。",
  },
  wedge: {
    symbol: "<  >",
    name: "渐强与渐弱",
    explanation:
      "横向楔形逐渐张开表示渐强，逐渐收拢表示渐弱。跨多个音延续，与单个音上的重音不同。",
    practice: "以整个乐句规划力度，逐渐变化，避免第一个音就太响。",
  },
  pedal: {
    symbol: "Ped. ＊",
    name: "延音踏板",
    explanation:
      "Ped. 或踏板线表示右踏板，＊或线的结束表示放开。踏板让已松开的弦继续共鸣。",
    practice:
      "和声变化时及时换踏板，先不踩踏板练清楚指间连接，再加入踏板。连接 MIDI 时可显示踏板状态。",
  },
  rest: {
    symbol: "𝄽",
    name: "休止符",
    explanation: "休止符表示有节奏地保持安静，也占用小节的拍数。",
    practice: "空拍时继续在心里数拍，不要提前进入下一个音。",
  },
  repeat: {
    symbol: "𝄆 𝄇",
    name: "反复与跳房子",
    explanation:
      "反复记号要求回到对应的起点。第一遍弹第一房子，第二遍跳过第一房子、进入第二房子。",
    practice:
      "先单独熟悉反复交界，再完整连接。D.C. / D.S. / Coda 可用 A–B 练习段辅助练习。",
  },
  fermata: {
    symbol: "𝄐",
    name: "延长记号",
    explanation:
      "在谱面时值基础上适当延长音或休止，由音乐语气决定，通常没有唯一固定倍数。",
    practice:
      "先按基础节拍熟悉，再听范奏决定延长。本页节奏评分按谱面时值，不自动猜测自由延长。",
  },
  trill: {
    symbol: "tr",
    name: "颤音与装饰音",
    explanation:
      "颤音在主音与邻近音之间快速交替。装饰音的奏法与时期、调性和风格有关。",
    practice:
      "先缓慢、均匀地交替，保持放松。本页不会把未写出具体时值的装饰音作为必须命中的音。",
  },
  note: {
    symbol: "♪",
    name: "音符与时值",
    explanation:
      "音符的纵向位置表示音高，符头、符干和符尾表示时值。附点增加原时值的一半；三连音把三个音放进通常两个同类音的时间。",
    practice: "先数拍、唱节奏，再找琴键。连接 MIDI 后可用“等我弹对”逐组熟悉。",
  },
};
