// The iPhone's side of the install prompt (src/features/published-map/home-screen.ts,
// 2026-10-13): an iPhone or iPad not on the home screen yet, and the browser
// it is in, which the owner's design will pick from.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/home-screen-test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  homeScreenBrowserOf,
  isAppleTouchDevice,
} from '../../src/features/published-map/home-screen.ts';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1';
const IPHONE_FACEBOOK =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22F76 [FBAN/FBIOS;FBAV/520.0.0.38.101;FBBV/750000000;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/18.5;FBSS/3;FBCR/;FBID/phone;FBLC/en_US;FBOP/80]';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36';

const device = (userAgent, more = {}) => ({
  userAgent,
  maxTouchPoints: 5,
  isStandalone: false,
  isDisplayStandalone: false,
  ...more,
});

test('an iPhone is one, and an iPad asking for the desktop site is one', () => {
  assert.equal(isAppleTouchDevice(device(IPHONE_SAFARI)), true);
  assert.equal(isAppleTouchDevice(device(IPAD_DESKTOP)), true);
});

test('a Mac, with no touch screen, is not one; nor is an Android phone', () => {
  assert.equal(isAppleTouchDevice(device(IPAD_DESKTOP, { maxTouchPoints: 0 })), false);
  assert.equal(isAppleTouchDevice(device(ANDROID_CHROME)), false);
});

test('Safari on an iPhone or iPad not added yet', () => {
  assert.equal(homeScreenBrowserOf(device(IPHONE_SAFARI)), 'safari');
  assert.equal(homeScreenBrowserOf(device(IPAD_DESKTOP)), 'safari');
});

test('nothing once opened from the home screen, by either sign', () => {
  assert.equal(homeScreenBrowserOf(device(IPHONE_SAFARI, { isStandalone: true })), null);
  assert.equal(homeScreenBrowserOf(device(IPHONE_SAFARI, { isDisplayStandalone: true })), null);
  assert.equal(homeScreenBrowserOf(device(IPHONE_CHROME, { isDisplayStandalone: true })), null);
});

test('Chrome on an iPhone is another browser, with its own Share menu', () => {
  assert.equal(homeScreenBrowserOf(device(IPHONE_CHROME)), 'other-browser');
});

test("Facebook's built-in browser is in-app: it cannot add to the home screen", () => {
  assert.equal(homeScreenBrowserOf(device(IPHONE_FACEBOOK)), 'in-app');
});

test('nothing on Android or a computer: the Android prompt is install-offer.ts', () => {
  assert.equal(homeScreenBrowserOf(device(ANDROID_CHROME)), null);
  assert.equal(homeScreenBrowserOf(device(IPAD_DESKTOP, { maxTouchPoints: 0 })), null);
});
