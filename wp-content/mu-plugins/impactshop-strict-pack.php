<?php
/**
 * ImpactShop – STRICT PACK (MU)
 *
 * Provides Bridge/AWIN (a.k.a. "strict") helpers so core reporting plus the
 * social ledger can read fallback conversions when the Dognet feed lacks them.
 *
 * Shortcodes (legacy, optional):
 *   [impact_ticker_strict]
 *   [impact_activity_strict]
 *   [impactshop_rows_strict from="YYYY-MM-DD" to="YYYY-MM-DD"]
 */

if (!defined('ABSPATH')) {
    exit;
}

if (!defined('IMPACTSHOP_STRICT_CHANNEL')) {
    define('IMPACTSHOP_STRICT_CHANNEL', 26081);
}

if (!defined('DOGNET_AD_CHANNEL_ID')) {
    define('DOGNET_AD_CHANNEL_ID', IMPACTSHOP_STRICT_CHANNEL);
}

/**
 * Attempt to resolve the NGO slug (data1) from a Bridge/AWIN row.
 */
if (!function_exists('ims_pick_d1')) {
    function ims_pick_d1(array $row): string
    {
        foreach (['data1', 'd1', 'ngo', 'ngo_slug', 'ngo_name'] as $key) {
            if (!empty($row[$key]) && is_string($row[$key])) {
                $value = trim((string) $row[$key]);
                if ($value !== '' && strtolower($value) !== '(ismeretlen)' && !is_numeric($value)) {
                    return $value;
                }
            }
        }

        if (function_exists('ibl__pick_d1')) {
            $value = trim((string) ibl__pick_d1($row));
            if ($value !== '' && strtolower($value) !== '(ismeretlen)' && !is_numeric($value)) {
                return $value;
            }
        }

        $shopSlug = '';
        foreach (['shop_slug', 'shop', 'shop_name', 'program'] as $key) {
            if (!empty($row[$key]) && is_string($row[$key])) {
                $shopSlug = sanitize_title($row[$key]);
                break;
            }
        }

        $fallbackFns = [
            'sharity_default_d1_for_shop',
            'impactshop_default_d1_for_shop',
            'impact_get_default_d1_for_shop',
        ];
        foreach ($fallbackFns as $fn) {
            if (function_exists($fn)) {
                try {
                    $value = trim((string) call_user_func($fn, $shopSlug, $row));
                    if ($value !== '' && strtolower($value) !== '(ismeretlen)' && !is_numeric($value)) {
                        return $value;
                    }
                } catch (Throwable $ignored) {
                }
            }
        }

        return '';
    }
}

/**
 * Fetch strict (Bridge/AWIN) conversions.
 *
 * @param array $args {
 *   @type string $from  Inclusive date (Y-m-d), default current month start.
 *   @type string $to    Inclusive date (Y-m-d), default today.
 *   @type int    $limit Maximum rows to return (protect upstream), default 2000.
 *   @type bool   $only_d1 Keep only rows where data1 resolves, default true.
 * }
 *
 * @return array{rows: array<int, array>, error: string|null}
 */
if (!function_exists('ims_strict_fetch')) {
    function ims_strict_fetch($args)
    {
        $defaults = [
            'from'    => date('Y-m-01'),
            'to'      => date('Y-m-d'),
            'only_d1' => true,
            'limit'   => 2000,
        ];
        $params = array_merge($defaults, is_array($args) ? $args : []);

        $rows = [];

        if (function_exists('ibl_fetch_transactions')) {
            try {
                $rows = ibl_fetch_transactions($params['from'], $params['to'], 'all', 120, 250);
                if (is_wp_error($rows)) {
                    $rows = [];
                }
            } catch (Throwable $e) {
                $rows = [];
            }
        } elseif (function_exists('impactshop_report_query')) {
            try {
                $rows = impactshop_report_query([
                    'from'       => $params['from'],
                    'to'         => $params['to'],
                    'ad_channel' => (string) IMPACTSHOP_STRICT_CHANNEL,
                    'raw'        => true,
                    'limit'      => (int) $params['limit'],
                ]);
                if (!is_array($rows)) {
                    $rows = [];
                }
            } catch (Throwable $e) {
                $rows = [];
            }
        } else {
            return [
                'rows'  => [],
                'error' => 'STRICT backend unavailable (missing Bridge Local / Report MVP).',
            ];
        }

        $out = [];
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }

            $statusRaw = strtolower(trim((string) ($row['status'] ?? $row['rstatus'] ?? '')));
            if ($statusRaw !== 'approved' && $statusRaw !== 'pending') {
                continue;
            }

            $ngo = ims_pick_d1($row);
            if ($params['only_d1'] && $ngo === '') {
                continue;
            }

            $commissionRaw = (string) ($row['publisher_commission'] ?? $row['commission'] ?? $row['payout'] ?? 0);
            $commission = (float) str_replace([',', '€', ' '], ['.', '', ''], $commissionRaw);

            $datetime = (string) ($row['created_at'] ?? $row['created'] ?? $row['date'] ?? '');
            $shop = (string) ($row['shop_name'] ?? $row['shop'] ?? $row['program'] ?? '');

            $out[] = [
                'datetime'   => $datetime,
                'shop'       => $shop,
                'ngo'        => $ngo,
                'status'     => $statusRaw,
                'commission' => $commission,
            ];
        }

        usort($out, static fn($a, $b) => strcmp($b['datetime'], $a['datetime']));

        if (count($out) > (int) $params['limit']) {
            $out = array_slice($out, 0, (int) $params['limit']);
        }

        return [
            'rows'  => $out,
            'error' => null,
        ];
    }
}

if (!function_exists('ims_donation_eur')) {
    function ims_donation_eur($commission)
    {
        return round(0.5 * (float) $commission, 2);
    }
}

add_shortcode('impact_ticker_strict', static function () {
    $res = ims_strict_fetch([
        'from' => date('Y-m-01'),
        'to'   => date('Y-m-d'),
    ]);
    if (!empty($res['error'])) {
        return '<div>STRICT ticker hiba: ' . esc_html($res['error']) . '</div>';
    }

    $total = 0.0;
    $today = 0.0;
    $todayYmd = date('Y-m-d');

    foreach ($res['rows'] as $row) {
        $donation = ims_donation_eur($row['commission']);
        $total += $donation;
        if (substr((string) $row['datetime'], 0, 10) === $todayYmd) {
            $today += $donation;
        }
    }

    return '<style>.ims-ticker{display:flex;gap:12px}.ims-card{flex:1;padding:14px;border-radius:12px;background:linear-gradient(90deg,#e7f0ff,#f4eefe)}.ims-card .k{opacity:.7;font-size:.9rem;margin-bottom:4px}.ims-card .v{font-size:1.6rem;font-weight:700}</style>'
        . '<div class="ims-ticker"><div class="ims-card"><div class="k">Összegyűjtve</div><div class="v">€ '
        . number_format($total, 2, ',', ' ')
        . '</div></div><div class="ims-card"><div class="k">Ma</div><div class="v">€ '
        . number_format($today, 2, ',', ' ')
        . '</div></div></div>';
});

add_shortcode('impact_activity_strict', static function () {
    $res = ims_strict_fetch([
        'from'  => date('Y-m-d', strtotime('-13 days')),
        'to'    => date('Y-m-d'),
        'limit' => 300,
    ]);
    if (!empty($res['error'])) {
        return '<div>STRICT activity hiba: ' . esc_html($res['error']) . '</div>';
    }

    $rows = array_slice($res['rows'], 0, 10);
    if (!$rows) {
        return '<div>Még nincsenek friss aktivitások.</div>';
    }

    $items = '';
    foreach ($rows as $row) {
        $items .= '<li><strong>' . esc_html($row['shop']) . '</strong> → ' . esc_html($row['ngo'])
            . ' • ' . esc_html(substr((string) $row['datetime'], 0, 16))
            . ' • € ' . number_format(ims_donation_eur($row['commission']), 2, ',', ' ')
            . ' <span style="opacity:.6">' . esc_html($row['status']) . '</span></li>';
    }

    return '<ul style="line-height:1.4;padding-left:18px">' . $items . '</ul>';
});

add_shortcode('impactshop_rows_strict', static function ($atts) {
    $atts = shortcode_atts([
        'from' => date('Y-m-01'),
        'to'   => date('Y-m-d'),
    ], $atts);

    $res = ims_strict_fetch([
        'from'  => $atts['from'],
        'to'    => $atts['to'],
        'limit' => 2000,
    ]);
    if (!empty($res['error'])) {
        return '<div>STRICT rows hiba: ' . esc_html($res['error']) . '</div>';
    }

    $sum = 0.0;
    $rows = '';
    foreach ($res['rows'] as $row) {
        $donation = ims_donation_eur($row['commission']);
        $sum += $donation;

        $rows .= '<tr><td>' . esc_html($row['datetime']) . '</td>'
            . '<td>' . esc_html($row['shop']) . '</td>'
            . '<td>' . esc_html($row['ngo']) . '</td>'
            . '<td>' . esc_html($row['status']) . '</td>'
            . '<td style="text-align:right">€ ' . number_format((float) $row['commission'], 2, ',', ' ') . '</td>'
            . '<td style="text-align:right">€ ' . number_format($donation, 2, ',', ' ') . '</td></tr>';
    }

    $rows .= '<tr><th colspan="5" style="text-align:right">Összesen</th>'
        . '<th style="text-align:right">€ ' . number_format($sum, 2, ',', ' ') . '</th></tr>';

    return '<style>.ims-table{width:100%;border-collapse:collapse}.ims-table th,.ims-table td{border:1px solid #eee;padding:6px}.ims-table th{background:#fafafa;text-align:left}</style>'
        . '<table class="ims-table"><tr><th>Dátum</th><th>Webshop</th><th>Szervezet (data1)</th><th>Státusz</th><th>Jutalék</th><th>Adomány (50%)</th></tr>'
        . $rows
        . '</table>';
});
