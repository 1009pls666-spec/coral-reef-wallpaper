const base = require("./electron-builder.json");

const identityName = process.env.WINDOWS_STORE_IDENTITY_NAME || "SoobinPark.51940BE59EFE";
const publisher = process.env.WINDOWS_STORE_PUBLISHER || "CN=0158E73A-5279-4088-9144-C353B1F3024F";
const publisherDisplayName = process.env.WINDOWS_STORE_PUBLISHER_DISPLAY_NAME || "Soobin Park";

module.exports = {
  ...base,
  artifactName: "coral-reef-wallpaper-store-${version}-${arch}.${ext}",
  win: {
    ...base.win,
    target: ["appx"],
    signAndEditExecutable: false,
  },
  appx: {
    identityName,
    applicationId: "CoralReefWallpaper",
    publisher,
    publisherDisplayName,
    displayName: "나의 산호초 바탕화면",
    backgroundColor: "#006D96",
    languages: ["ko-KR", "en-US"],
    showNameOnTiles: true,
    setBuildNumber: true,
    minVersion: "10.0.19041.0",
    maxVersionTested: "10.0.26100.0",
    addAutoLaunchExtension: false,
  },
};
