/* global chrome */
// Keeps an extension worker available for chrome.tabs.setZoom in an isolated test profile.
chrome.runtime.onInstalled.addListener(() => {})
