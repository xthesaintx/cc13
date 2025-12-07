/**
 * Custom control icon used to display Campaign Codex journal pages with map codes.
 * This class renders the circular icon based on the style defined in CONFIG.
 */
export class CampaignCodexMapMarker extends PIXI.Container {
  constructor({code, size = 40, ...style} = {}, ...args) {
    super(...args);

    this.code = code;
    this.size = size;

    this.tooltip = tooltip;
    this.style = style;
    this.uiColor = game.settings.get("campaign-codex", "color-ui");
    this.customColour = game.settings.get("campaign-codex", "mapMarkerColor");



    this.renderMarker();
    this.refresh();
  }
  
  renderMarker() {
    const bgColor = this.customColour ? this.uiColor: Color.from(this.style.tint);
    this.style.textColor = this._getContrastColor(Number(bgColor));
    this.radius = this.size;
    const centerX = this.radius /2;
    const centerY = this.radius/2;
    // Define hit area
    this.eventMode = "static";
    this.interactiveChildren = false;
    this.hitArea = new PIXI.Circle(centerX, centerY, this.radius);
    this.cursor = "pointer";

    // Drop Shadow
    this.shadow = this.addChild(new PIXI.Graphics());
    this.shadow.clear()
      .beginFill(this.style.shadowColor, 0.65)
      .drawCircle(centerX, centerY + 2, this.radius + 2) // Soft shadow below
      .endFill();
    this.shadow.filters = [new PIXI.BlurFilter(5)];

    // Background
    this.bg = this.addChild(new PIXI.Graphics());
    this.bg.clear()
      .beginFill(bgColor, 1.0)
      .lineStyle(2, this.style.borderColor, 1.0)
      .drawCircle(centerX, centerY, this.radius) // Centered
      .endFill();

    // Text
    // Use standard PIXI.Text for compatibility.
    this.text = new PIXI.Text(this.code, this._getTextStyle(this.code.length, this.size));
    this.text.anchor.set(0.5, 0.5);
    this.text.position.set(centerX, centerY);
    this.addChild(this.text);

    // Border (for hover)
    this.border = this.addChild(new PIXI.Graphics());
    this.border.visible = false;
    // Store circle path for refresh
    this.circle = [centerX, centerY, this.radius];
  }

  _getContrastColor(bgColorInt) {
    const r = (bgColorInt >> 16) & 255;
    const g = (bgColorInt >> 8) & 255;
    const b = bgColorInt & 255;
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    if (brightness > 128) {
        return 0x2a2a2a;
    } else {
        return 0xFFFFFF;
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  refresh({visible, iconColor, borderColor, borderVisible} = {}) {
    if ( borderColor ) this.borderColor = borderColor;
    this.border.clear().lineStyle(2, this.borderColor, 1.0).drawCircle(...this.circle).endFill();
    if ( borderVisible !== undefined ) this.border.visible = borderVisible;
    if ( visible !== undefined ) this.visible = visible;
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Define PIXI.TextStyle object.
   */
  _getTextStyle(characterCount, size) {
    const style = new PIXI.TextStyle({
      dropShadow: false,
      fill: this.style.textColor,
      strokeThickness: 0,
      fontFamily: "Signika", 
      fontSize: characterCount > 2 ? size * .5 : size * .6,
      fontWeight: "bold",
    });

    if ( this.style.fontFamily ) {
      style.fontFamily = Array.isArray(this.style.fontFamily)
        ? [...this.style.fontFamily, "Signika"]
        : [this.style.fontFamily, "Signika"];
    }
    return style;
  }
}


// /**
//  * A helper function to be attached to the Note.prototype.
//  * It checks if a note should have a custom Campaign Codex icon.
//  * 'this' is assumed to be an instance of a Note.
//  * @returns {PIXI.Container|void}
//  */
// export function _getCampaignCodexIcon() {
//   const journal = this.document.entry;
//   if ( !journal ) return;

//   const isCC = journal.getFlag("campaign-codex", "type");
//   if ( !isCC ) return;

//   const mapCodeRegex = /^([A-Z]?\d{1,3}[A-Z]?)(?=\s*[-: ]|$)/i;
//   // const mapCodeRegex = /^([A-Z]?\d{1,3})\s*-\s*/i;
//   const match = journal.name.match(mapCodeRegex);

//   if ( !match ) return;

//   const code = match[1].toUpperCase(); // Get the code (e.g., "H1" or "001")

//   // We have a match! Create the custom icon.
//   const {icon: IconClass, ...style} = foundry.utils.mergeObject(
//     CONFIG.CampaignCodex.mapLocationMarker.default,
//     {},
//     {inplace: false},
//   );

//   const options = {
//     size: this.document.iconSize,
//     tint: Color.from(this.document.texture.tint || null),
//   };
//   return new IconClass({code: code, ...options, ...style});
// }




/**
 * A helper function to be attached to the Note.prototype.
 * It checks if a note should have a custom Campaign Codex icon.
 * 'this' is assumed to be an instance of a Note.
 * @returns {PIXI.Container|void}
 */
export function _getCampaignCodexIcon() {
  const journal = this.document.entry;
  if ( !journal ) return;

  const isCC = journal.getFlag("campaign-codex", "type");
  if ( !isCC ) return;

  // Retrieve mapMarker from the 'data' flag object
  const mapMarker = journal.getFlag("campaign-codex", "data")?.mapMarker;
  let code;

  // 1. If mapMarker is set (not "" or undefined), use it
  if (mapMarker) {
    code = mapMarker.toUpperCase();
  } 
  // 2. Else, try to match the Regex
  else {
    const mapCodeRegex = /^([A-Z]?\d{1,3}[A-Z]?)(?=\s*[-: ]|$)/i;
    const match = journal.name.match(mapCodeRegex);

    // 3. If no regex match, return
    if ( !match ) return;
    
    code = match[1].toUpperCase();
  }
  const {icon: IconClass, ...style} = foundry.utils.mergeObject(
    CONFIG.CampaignCodex.mapLocationMarker.default,
    {},
    {inplace: false},
  );

  const options = {
    size: this.document.iconSize,
    tint: Color.from(this.document.texture.tint || null),
  };
  return new IconClass({code: code, ...options, ...style});
}












