/** An original short exercise, safe to redistribute with the blog. */
export const demoXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><work><work-title>晨光 · 五指练习</work-title></work><identification><creator type="composer">Yasin's Piano Room</creator></identification><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">${Array.from(
  { length: 8 },
  (_, i) => {
    const melody = [
      ["C", "D", "E", "G"],
      ["F", "E", "D", "C"],
      ["E", "F", "G", "E"],
      ["D", "E", "D", "C"],
      ["C", "E", "G", "E"],
      ["F", "A", "G", "F"],
      ["E", "G", "D", "B"],
      ["C", "E", "D", "C"],
    ][i];
    const fingers = [
      [1, 2, 3, 5],
      [4, 3, 2, 1],
      [3, 4, 5, 3],
      [2, 3, 2, 1],
      [1, 3, 5, 3],
      [1, 3, 2, 1],
      [2, 4, 1, 2],
      [1, 3, 2, 1],
    ][i];
    return `<measure number="${i + 1}">${i === 0 ? '<attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes><direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>80</per-minute></metronome></direction-type><sound tempo="80"/></direction><direction><direction-type><dynamics><mp/></dynamics></direction-type></direction>' : ""}${melody.map((step, j) => `<note><pitch><step>${step}</step><octave>${i === 6 && j === 3 ? 3 : 4}</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff><notations><technical><fingering>${fingers[j]}</fingering></technical>${i === 4 ? "<articulations><staccato/></articulations>" : ""}</notations></note>`).join("")}<backup><duration>16</duration></backup>${[0, 1].map((_, j) => `<note><pitch><step>${i === 5 ? "F" : i === 6 ? "G" : "C"}</step><octave>${j === 0 ? 3 : 2}</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff><notations><technical><fingering>${j === 0 ? 1 : 5}</fingering></technical></notations></note>`).join("")}${i === 7 ? '<barline location="right"><bar-style>light-heavy</bar-style></barline>' : ""}</measure>`;
  },
).join("")}</part></score-partwise>`;
