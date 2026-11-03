"use strict";
const StormWeaponCatalog = (() => {
  const rarities = [
    { name: "Common", color: "#bac3cd", damage: 1, accuracy: 1, reload: 1 },
    { name: "Uncommon", color: "#76df76", damage: 1.08, accuracy: .9, reload: .95 },
    { name: "Rare", color: "#62b8ff", damage: 1.16, accuracy: .8, reload: .9 },
    { name: "Epic", color: "#cc85ff", damage: 1.25, accuracy: .7, reload: .85 },
    { name: "Legendary", color: "#ffcd65", damage: 1.36, accuracy: .6, reload: .8 }
  ];
  // Models have independent stats; rarity is a separate roll, not a renamed gun.
  const families = [
    { type: "Assault rifle", shape: "rifle", damage: 23, rate: .14, mag: 30, reload: 1.8, range: 65, spread: .022,
      models: ["Pathfinder AR", "Vanguard AR", "Tempest AR", "Sentinel AR", "Nomad AR"] },
    { type: "SMG", shape: "smg", damage: 15, rate: .075, mag: 32, reload: 1.5, range: 32, spread: .045,
      models: ["Firefly SMG", "Hornet SMG", "Cyclone SMG", "Vector SMG", "Pulse SMG"] },
    { type: "Shotgun", shape: "shotgun", damage: 12, rate: .75, mag: 6, reload: 2.2, range: 23, spread: .10, pellets: 8,
      models: ["Breach Shotgun", "Thunder Shotgun", "Ranger Shotgun", "Scatter Shotgun", "Hammer Shotgun"] },
    { type: "Sniper", shape: "sniper", damage: 88, rate: 1.2, mag: 5, reload: 2.6, range: 150, spread: .003,
      models: ["Horizon Sniper", "Longwatch Sniper", "Ghost Sniper", "Summit Sniper", "Northstar Sniper"] },
    { type: "Pistol", shape: "pistol", damage: 26, rate: .28, mag: 14, reload: 1.2, range: 40, spread: .025,
      models: ["Courier Pistol", "Sidekick Pistol", "Ember Pistol", "Viper Pistol", "Beacon Pistol"] },
    { type: "LMG", shape: "lmg", damage: 21, rate: .11, mag: 60, reload: 3.2, range: 70, spread: .04,
      models: ["Bulwark LMG", "Bastion LMG", "Titan LMG", "Ironclad LMG", "Atlas LMG"] },
    { type: "Marksman rifle", shape: "marksman", damage: 43, rate: .38, mag: 16, reload: 2, range: 95, spread: .008,
      models: ["Scout DMR", "Osprey DMR", "Falcon DMR", "Warden DMR", "Trailblazer DMR"] },
    { type: "Burst rifle", shape: "burst", damage: 20, rate: .48, mag: 27, reload: 1.9, range: 62, spread: .017, burst: 3,
      models: ["Trident Burst", "Echo Burst", "Prism Burst", "Mirage Burst", "Specter Burst"] }
  ];
  const guns = families.flatMap((family, group) => family.models.map((name, variant) => ({
    id: group * 5 + variant, name, type: family.type, shape: family.shape,
    damage: family.damage + variant * (family.shape === "sniper" ? 3 : 1),
    rate: family.rate * [1, .93, 1.1, .85, 1.04][variant],
    mag: family.mag + [0, 2, -2, 4, 0][variant],
    reload: family.reload * [1, 1.04, .9, 1.12, .95][variant],
    range: family.range + variant * 2,
    spread: family.spread * [1, 1.05, .85, 1.15, .92][variant],
    pellets: family.pellets || 1, burst: family.burst || 1
  })));
  function create(id, rarity = 0) {
    const base = guns[id], tier = rarities[rarity];
    return { ...base, rarity, damage: base.damage * tier.damage,
      spread: base.spread * tier.accuracy, reloadTime: base.reload * tier.reload,
      ammo: base.mag, reserve: base.mag * 4, reloadLeft: 0, cooldown: 0, burstLeft: 0, burstTime: 0 };
  }
  function roll() {
    const n = Math.random();
    return n < .38 ? 0 : n < .66 ? 1 : n < .85 ? 2 : n < .96 ? 3 : 4;
  }
  return { guns, rarities, create, roll };
})();
if (typeof module !== "undefined" && module.exports) module.exports = StormWeaponCatalog;
else window.StormWeapons = StormWeaponCatalog;
