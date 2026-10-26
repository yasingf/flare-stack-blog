import type { StaffLine, VexFlowMusicSheetDrawer } from "opensheetmusicdisplay";

type PedalDrawer = {
  drawPedals: (staff: StaffLine) => void;
  pianoPedalTargets?: boolean;
  backend: {
    getContext: () => {
      openGroup: (name: string) => Element | undefined;
      closeGroup: () => void;
    };
  };
};
/** OSMD 2.2's pedal renderer omits the SVG group used by its other symbols.
 * Group the original drawing (including native change notches) instead of
 * painting approximate duplicate labels over the score. Keep this adapter
 * isolated because drawPedals is a protected OSMD extension point. */
export function enablePedalTargets(Drawer: typeof VexFlowMusicSheetDrawer) {
  const prototype = Drawer.prototype as unknown as PedalDrawer;
  if (prototype.pianoPedalTargets) return;
  const draw = prototype.drawPedals;
  if (typeof draw !== "function") return;
  prototype.pianoPedalTargets = true;
  prototype.drawPedals = function (staff) {
    if (!staff.Pedals.length) return draw.call(this, staff);
    const context = this.backend.getContext();
    const group = context.openGroup("piano-pedal");
    group?.setAttribute("data-piano-symbol", "pedal");
    try {
      draw.call(this, staff);
    } finally {
      context.closeGroup();
    }
  };
}
