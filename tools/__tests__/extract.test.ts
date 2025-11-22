import {readFileSync} from 'fs';
import * as path from 'path';
import {describe, it, expect} from '@jest/globals';
import {extractFromHtml} from '../coupon-harvester';

const fixtures = (file: string) => readFileSync(path.join(__dirname, '..', 'fixtures', 'html', file), 'utf8');

describe('extractFromHtml', () => {
  it('ki tudja nyerni a kuponkódot és kedvezményt', () => {
    const html = fixtures('decathlon-coupon.html');
    const coupon = extractFromHtml(html, 'Tárgy', 'promo@decathlon.hu', [
      {slug: 'decathlon', domain: 'decathlon.hu'},
    ]);
    expect(coupon?.coupon_code).toBe('SPORT20');
    expect(coupon?.discount_label).toMatch(/20%/);
    expect(coupon?.shop_slug).toBe('decathlon');
  });

  it('ismeretlen domain esetén needs_mapping-et ad', () => {
    const html = fixtures('decathlon-coupon.html');
    const coupon = extractFromHtml(html, 'Tárgy', 'promo@unknown.hu', [
      {slug: 'decathlon', domain: 'decathlon.hu'},
    ]);
    expect(coupon?.shop_slug).toBe('NEEDS_MAPPING');
  });

  it('felismeri az ingyenes szállítás jellegű kedvezményt', () => {
    const html = fixtures('free-shipping-coupon.html');
    const coupon = extractFromHtml(html, 'Ingyenes szállítás kuponkód', 'shop@sample.hu', [
      {slug: 'sample_shop', domain: 'sample.hu'},
    ]);
    expect(coupon?.coupon_code).toBe('FREESHIP');
    expect(coupon?.discount_label.toLowerCase()).toContain('ingyenes');
    expect(coupon?.expiry_unknown).toBe(false);
  });

  it('kezeli az EUR alapú kedvezmény formát', () => {
    const html = fixtures('euro-coupon.html');
    const coupon = extractFromHtml(html, 'Téli akció', 'promo@euroshop.hu', [
      {slug: 'euroshop', domain: 'euroshop.hu'},
    ]);
    expect(coupon?.coupon_code).toBe('WINTER25');
    expect(coupon?.discount_label.toLowerCase()).toContain('eur');
    expect(coupon?.expiry_unknown).toBe(false);
  });

  it('ha nincs lejárat, expiry_unknown igaz', () => {
    const html = fixtures('no-expiry-percent.html');
    const coupon = extractFromHtml(html, 'Őszi akció', 'promo@fall.hu', [
      {slug: 'fallshop', domain: 'fall.hu'},
    ]);
    expect(coupon?.coupon_code).toBe('OSZI15');
    expect(coupon?.expiry_unknown).toBe(true);
  });

  it('több kód esetén is visszaad legalább egyet', () => {
    const html = fixtures('multiple-codes.html');
    const coupon = extractFromHtml(html, 'Több kód', 'promo@multishop.hu', [
      {slug: 'multishop', domain: 'multishop.hu'},
    ]);
    expect(coupon?.coupon_code).toBeDefined();
    expect(['FALL10', 'SHOES15']).toContain(coupon?.coupon_code);
  });
});
