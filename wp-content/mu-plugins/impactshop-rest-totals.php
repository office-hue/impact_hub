<?php
/**
 * Plugin Name: ImpactShop REST Totals
 * Description: Provides /wp-json/impactshop/v1/totals + Dognet helpers so the mini shortcodes and sticky sum bar can aggregate NGO/shop metrics.
 * Version:     1.0.0
 * Author:      ImpactShop
 */

if (!defined('ABSPATH')) {
    exit;
}

/* -------------------------------------------------------------------------
 * Helper maps (NGO + shop display names)
 * ---------------------------------------------------------------------- */

if (!function_exists('impactshop_totals_canonical_slug')) {
    function impactshop_totals_canonical_slug($slug)
    {
        $slug = sanitize_title($slug);
        if ($slug === '') {
            return '';
        }

        $aliases = [
            'kozos-ugyunk-az-alatvedelem' => 'kozos-ugyunk-az-allatvedelem-alapitvany',
            'kozos-ugyunk-az-allatvedelem' => 'kozos-ugyunk-az-allatvedelem-alapitvany',
        ];

        return $aliases[$slug] ?? $slug;
    }
}

if (!function_exists('impactshop_totals_ngo_map')) {
    function impactshop_totals_ngo_map()
    {
        $cacheKey = 'impactshop_totals_ngo_map_v1';
        $map = get_transient($cacheKey);
        if (is_array($map)) {
            return $map;
        }

        $map = [];
        $url = defined('IMPACTSHOP_NGO_CODES_URL')
            ? IMPACTSHOP_NGO_CODES_URL
            : 'https://app.sharity.hu/wp-content/uploads/2025/09/ngo_codes.csv';

        $resp = wp_remote_get($url, ['timeout' => 15]);
        if (!is_wp_error($resp)) {
            $body = wp_remote_retrieve_body($resp);
            $lines = preg_split("/\r\n|\r|\n/", trim((string) $body));
            if ($lines) {
                array_shift($lines); // header
                foreach ($lines as $line) {
                    if ($line === '') {
                        continue;
                    }
                    $cols = str_getcsv($line);
                    if (count($cols) < 2) {
                        continue;
                    }
                    $name = trim($cols[0]);
                    $slug = impactshop_totals_canonical_slug($cols[1]);
                    if ($name !== '' && $slug !== '') {
                        $map[$slug] = $name;
                    }
                }
            }
        }

        set_transient($cacheKey, $map, 12 * HOUR_IN_SECONDS);
        return $map;
    }
}

if (!function_exists('impactshop_resolve_ngo_name')) {
    function impactshop_resolve_ngo_name($slug)
    {
        $slug = impactshop_totals_canonical_slug($slug);
        if ($slug === '') {
            return '';
        }

        $overrides = [
            'kozos-ugyunk-az-allatvedelem-alapitvany' => 'Közös ügyünk az állatvédelem Alapítvány',
        ];
        if (isset($overrides[$slug])) {
            return $overrides[$slug];
        }

        $map = impactshop_totals_ngo_map();
        if (isset($map[$slug])) {
            return $map[$slug];
        }

        return ucwords(str_replace('-', ' ', $slug));
    }
}

if (!function_exists('impactshop_resolve_shop_name_by_slug')) {
    function impactshop_resolve_shop_name_by_slug($slug)
    {
        $slug = sanitize_title($slug);
        if ($slug === '') {
            return '';
        }

        $cacheKey = 'impactshop_totals_shop_map_v1';
        $map = get_transient($cacheKey);
        if (!is_array($map)) {
            $map = [];
            $resp = wp_remote_get('https://docs.google.com/spreadsheets/d/e/2PACX-1vR8ASri56jQ1h7yzeb1lWqOvvOY3Kli7x8WxdkLwlet6I7QnBoOg2oiaNEcxdjSp3UbV8kjhMKWzXPz/pub?gid=0&single=true&output=csv', ['timeout' => 15]);
            if (!is_wp_error($resp)) {
                $body = wp_remote_retrieve_body($resp);
                $lines = preg_split("/\r\n|\r|\n/", trim((string) $body));
                if ($lines) {
                    $headers = str_getcsv(array_shift($lines));
                    $headersLower = array_map('strtolower', $headers);
                    $nameIdx = array_search('name', $headersLower, true);
                    $slugIdx = array_search('shop_slug', $headersLower, true);
                    if ($nameIdx !== false && $slugIdx !== false) {
                        foreach ($lines as $line) {
                            if ($line === '') {
                                continue;
                            }
                            $cols = str_getcsv($line);
                            $slugVal = sanitize_title($cols[$slugIdx] ?? '');
                            $nameVal = trim($cols[$nameIdx] ?? '');
                            if ($slugVal && $nameVal) {
                                $map[$slugVal] = $nameVal;
                            }
                        }
                    }
                }
            }
            set_transient($cacheKey, $map, 6 * HOUR_IN_SECONDS);
        }

        return $map[$slug] ?? ucwords(str_replace('-', ' ', $slug));
    }
}

/* -------------------------------------------------------------------------
 * Dognet API helpers (fallbacks – respect existing implementations)
 * ---------------------------------------------------------------------- */
if (!function_exists('dognet_get_token')) {
    function dognet_get_token($force = false)
    {
        $cacheKey = 'dognet_api_token_cache_v1';
        if (!$force) {
            $cached = get_transient($cacheKey);
            if ($cached) {
                return $cached;
            }
        }

        $email = defined('DOGNET_LOGIN_EMAIL') ? DOGNET_LOGIN_EMAIL : '';
        $password = defined('DOGNET_LOGIN_PASSWORD') ? DOGNET_LOGIN_PASSWORD : '';
        $base = defined('DOGNET_API_BASE') ? rtrim(DOGNET_API_BASE, '/') : 'https://api.app.dognet.com/api/v1';

        if ($email === '' || $password === '') {
            return '';
        }

        $endpoint = $base . '/auth/login';
        $payloads = [
            [
                'headers' => ['Content-Type' => 'application/json', 'Accept' => 'application/json'],
                'body'    => wp_json_encode(['email' => $email, 'password' => $password]),
            ],
            [
                'headers' => ['Content-Type' => 'application/x-www-form-urlencoded', 'Accept' => 'application/json'],
                'body'    => http_build_query(['email' => $email, 'password' => $password]),
            ],
        ];

        foreach ($payloads as $payload) {
            $resp = wp_remote_post($endpoint, ['timeout' => 25] + $payload);
            if (is_wp_error($resp)) {
                continue;
            }
            $code = wp_remote_retrieve_response_code($resp);
            $data = json_decode(wp_remote_retrieve_body($resp), true);
            if ($code >= 200 && $code < 300 && !empty($data)) {
                $token = '';
                foreach (['token', 'access_token'] as $key) {
                    if (!empty($data[$key]) && is_string($data[$key])) {
                        $token = $data[$key];
                        break;
                    }
                }
                if (!$token && !empty($data['data']) && is_array($data['data'])) {
                    foreach (['token', 'access_token'] as $key) {
                        if (!empty($data['data'][$key]) && is_string($data['data'][$key])) {
                            $token = $data['data'][$key];
                            break;
                        }
                    }
                }
                if ($token) {
                    set_transient($cacheKey, $token, defined('DOGNET_TOKEN_TTL') ? DOGNET_TOKEN_TTL : 20 * HOUR_IN_SECONDS);
                    return $token;
                }
            }
        }

        return '';
    }
}

if (!function_exists('dognet_api_request')) {
    function dognet_api_request($method, $path, $body = null)
    {
        $token = dognet_get_token(false);
        if (!$token) {
            return new WP_Error('dognet_no_token', 'Dognet API token nem elérhető');
        }

        $base = defined('DOGNET_API_BASE') ? rtrim(DOGNET_API_BASE, '/') : 'https://api.app.dognet.com/api/v1';
        $url  = $base . $path;

        $args = [
            'method'  => strtoupper($method),
            'timeout' => 30,
            'headers' => [
                'Authorization' => 'Bearer ' . $token,
                'Accept'        => 'application/json',
                'Content-Type'  => 'application/json',
            ],
        ];
        if ($body !== null) {
            $args['body'] = is_string($body) ? $body : wp_json_encode($body);
        }

        $resp = wp_remote_request($url, $args);
        if (is_wp_error($resp)) {
            return $resp;
        }

        $code = wp_remote_retrieve_response_code($resp);
        $raw  = wp_remote_retrieve_body($resp);
        $json = json_decode($raw, true);

        if ($code === 401) {
            delete_transient('dognet_api_token_cache_v1');
            $token = dognet_get_token(true);
            if ($token) {
                return dognet_api_request($method, $path, $body);
            }
        }

        if ($code < 200 || $code >= 300) {
            return new WP_Error(
                'dognet_api_error',
                sprintf('Dognet API hiba (HTTP %d)', $code),
                ['code' => $code, 'response' => $json ?: $raw, 'path' => $path, 'method' => $method]
            );
        }

        return $json ?: [];
    }
}

/* -------------------------------------------------------------------------
 * Conversion fetchers (exposed globally for legacy shortcodes)
 * ---------------------------------------------------------------------- */

if (!function_exists('dognet_api_list_conversions_batch')) {
    function dognet_api_list_conversions_batch($from, $to, $status = 'all', $lastId = null, $perPage = 200)
    {
        $fromDt = $from . ' 00:00:00';
        $toDt   = $to . ' 23:59:59';

        $status = strtolower(trim((string)$status));
        $map = [
            'approved' => ['A'],
            'pending'  => ['P'],
            'rejected' => ['D'],
        ];

        $filter = [
            ['created_at' => ['gte' => $fromDt]],
            ['created_at' => ['lte' => $toDt]],
        ];
        if (isset($map[$status])) {
            $filter[] = ['rstatus' => ['in' => $map[$status]]];
        }
        if (defined('DOGNET_AD_CHANNEL_ID') && DOGNET_AD_CHANNEL_ID) {
            $filter[] = ['ad_channel_id' => ['eq' => intval(DOGNET_AD_CHANNEL_ID)]];
        }

        $body = [
            'per-page' => max(1, min(1000, intval($perPage))),
            'filter'   => $filter,
        ];
        if ($lastId !== null) {
            $body['last_id'] = intval($lastId);
        }

        $resp = dognet_api_request('POST', '/raw-transactions/filter', $body);
        if (is_wp_error($resp)) {
            return $resp;
        }

        $items = [];
        if (isset($resp['data']) && is_array($resp['data'])) {
            $items = $resp['data'];
        } elseif (isset($resp['items']) && is_array($resp['items'])) {
            $items = $resp['items'];
        }

        $nextLastId = null;
        if (isset($resp['meta']['last_id']) && $resp['meta']['last_id'] !== null) {
            $nextLastId = intval($resp['meta']['last_id']);
            if ($nextLastId <= 0) {
                $nextLastId = null;
            }
        } elseif ($items) {
            foreach ($items as $item) {
                foreach (['id', 'transaction_id', 'tid'] as $k) {
                    if (isset($item[$k]) && is_numeric($item[$k])) {
                        $nextLastId = max(intval($item[$k]), intval($nextLastId));
                    }
                }
            }
            if ($nextLastId !== null) {
                $nextLastId = intval($nextLastId);
            }
        }

        return [
            'items'   => $items,
            'last_id' => $nextLastId,
        ];
    }
}

if (!function_exists('dognet_api_list_conversions_all')) {
    function dognet_api_list_conversions_all($from, $to, $status = 'all', $maxBatches = 200, $perPage = 200)
    {
        $from = date('Y-m-d', strtotime($from));
        $to   = date('Y-m-d', strtotime($to));

        $all     = [];
        $lastId  = null;

        for ($i = 0; $i < max(1, intval($maxBatches)); $i++) {
            $batch = dognet_api_list_conversions_batch($from, $to, $status, $lastId, $perPage);
            if (is_wp_error($batch)) {
                return ['error' => $batch];
            }

            $items = is_array($batch['items'] ?? null) ? $batch['items'] : [];
            if (!$items) {
                break;
            }

            $all = array_merge($all, $items);
            $lastId = $batch['last_id'] ?? null;
            if ($lastId === null) {
                break;
            }
        }

        return ['items' => $all];
    }
}

/* -------------------------------------------------------------------------
 * NGO helper (fallback for strict pick)
 * ---------------------------------------------------------------------- */
if (!function_exists('impactshop_pick_ngo_from_row')) {
    function impactshop_pick_ngo_from_row($row)
    {
        $candidates = [];
        foreach (['d1','data1','ref1','sub_id','subid','sub_id1','ngo','ngo_name'] as $key) {
            if (!empty($row[$key]) && !is_array($row[$key])) {
                $candidates[] = trim((string)$row[$key]);
            }
        }

        if (!empty($row['last_click']) && is_array($row['last_click'])) {
            foreach (['data1','d1','subid','sub_id1','sub_id'] as $key) {
                if (!empty($row['last_click'][$key]) && is_string($row['last_click'][$key])) {
                    $candidates[] = trim($row['last_click'][$key]);
                }
            }
        }

        $slugLike = function ($value) {
            return (bool)(preg_match('~^[a-z0-9._-]{3,}$~i', $value) && preg_match('~[a-z]~i', $value));
        };

        foreach ($candidates as $candidate) {
            if ($slugLike($candidate)) {
                return sanitize_title($candidate);
            }
        }

        foreach ($candidates as $candidate) {
            if (stripos($candidate, 'http://') === 0 || stripos($candidate, 'https://') === 0) {
                $query = parse_url($candidate, PHP_URL_QUERY);
                if ($query) {
                    parse_str($query, $qs);
                    foreach (['d1','ngo','org','utm_term'] as $key) {
                        if (!empty($qs[$key])) {
                            $value = trim((string)$qs[$key]);
                            if ($slugLike($value)) {
                                return sanitize_title($value);
                            }
                        }
                    }
                }
            }
        }

        foreach ($candidates as $candidate) {
            if (!is_numeric($candidate)) {
                return sanitize_title($candidate);
            }
        }

        return '';
    }
}

/* -------------------------------------------------------------------------
 * Totals collector + REST endpoint
 * ---------------------------------------------------------------------- */

if (!function_exists('impactshop_totals_collect')) {
    function impactshop_totals_collect($from, $to, $status = 'all', $group = 'shop_ngo', $ngoFilter = '', $limit = 0, $currency = 'EUR', $rateHuf = 392, $donationRate = null)
    {
        $from = date('Y-m-d', strtotime($from));
        $to   = date('Y-m-d', strtotime($to));
        $status = strtolower(trim((string)$status));
        $group  = strtolower(trim((string)$group));
        $ngoFilter = sanitize_title($ngoFilter);
        $limit = max(0, (int) $limit);
        $currency = strtoupper($currency ?: 'EUR');
        $rateHuf = (float) $rateHuf;
        if ($rateHuf <= 0) {
            $rateHuf = 392;
        }
        if ($donationRate === null || $donationRate === '') {
            $donationRate = defined('IMPACT_DONATION_RATE') ? (float) IMPACT_DONATION_RATE : 0.5;
        } else {
            $donationRate = max(0.0, (float) $donationRate);
        }

        $cacheKey = 'impactshop_totals_v2_' . md5(implode('|', [
            $from,
            $to,
            $status,
            $group,
            $ngoFilter,
            $limit,
            $currency,
            $rateHuf,
            $donationRate,
        ]));
        $cached = get_transient($cacheKey);
        if ($cached !== false) {
            return $cached;
        }

        $maxBatches = apply_filters('impactshop_totals_max_batches', 80);
        $perPage    = apply_filters('impactshop_totals_per_page', 200);

        $all = dognet_api_list_conversions_all($from, $to, $status, $maxBatches, $perPage);
        if (isset($all['error']) && is_wp_error($all['error'])) {
            return $all['error'];
        }

        $items = is_array($all['items'] ?? null) ? $all['items'] : [];
        $map   = [];

        if (function_exists('impactshop_get_shops')) {
            foreach ((array)impactshop_get_shops() as $shop) {
                $cid = 0;
                if (!empty($shop['dognet_base']) && function_exists('dognet_extract_campaign_id_from_base')) {
                    $cid = intval(dognet_extract_campaign_id_from_base($shop['dognet_base']));
                }
                if ($cid) {
                    $map[$cid] = [
                        'shop_name' => $shop['name'] ?? ('cid ' . $cid),
                        'shop_slug' => $shop['shop_slug'] ?? '',
                    ];
                }
            }
        }

        $rows       = [];
        $grand      = ['orders' => 0, 'order_value' => 0.0, 'commission' => 0.0];
        $slugTotals = [];

        foreach ($items as $item) {
            $commission = 0.0;
            foreach (['commission','publisher_commission','publisherPayout','commission_publisher'] as $key) {
                if (isset($item[$key]) && is_numeric($item[$key])) {
                    $commission = (float)$item[$key];
                    break;
                }
            }

            $orderValue = 0.0;
            foreach (['amount','order_value','sale_amount','price'] as $key) {
                if (isset($item[$key]) && is_numeric($item[$key])) {
                    $orderValue = (float)$item[$key];
                    break;
                }
            }

            $ngoSlug = '';
            if (function_exists('ism_pick_ngo_from_row')) {
                $ngoSlug = sanitize_title(ism_pick_ngo_from_row($item));
            } else {
                $ngoSlug = impactshop_pick_ngo_from_row($item);
            }
            if ($ngoSlug !== '') {
                if (function_exists('impactshop_resolve_ngo_name')) {
                    $ngoLabel = impactshop_resolve_ngo_name($ngoSlug);
                } else {
                    $ngoLabel = $ngoSlug;
                }
            } else {
                $ngoLabel = __('Ismeretlen ügy', 'impactshop');
            }
            if ($ngoFilter && $ngoSlug !== $ngoFilter) {
                continue;
            }

            $cid = 0;
            foreach (['campaign_id','campaignId','cid','campaign'] as $key) {
                if (isset($item[$key])) {
                    $cid = is_array($item[$key]) ? intval($item[$key]['id'] ?? 0) : intval($item[$key]);
                    if ($cid) {
                        break;
                    }
                }
            }

            $shopName = __('Ismeretlen shop', 'impactshop');
            $shopSlug = '';
            if ($cid && isset($map[$cid])) {
                $shopName = $map[$cid]['shop_name'] ?: ('cid ' . $cid);
                $shopSlug = $map[$cid]['shop_slug'] ?: '';
            } elseif (!empty($item['campaign_name'])) {
                $shopName = (string)$item['campaign_name'];
            } elseif (!empty($item['shop_slug'])) {
                $shopSlug = sanitize_title($item['shop_slug']);
            }

            if ($shopSlug && $shopName === __('Ismeretlen shop', 'impactshop') && function_exists('impactshop_resolve_shop_name_by_slug')) {
                $shopName = impactshop_resolve_shop_name_by_slug($shopSlug);
            }

            switch ($group) {
                case 'ngo':
                    $key = $ngoLabel;
                    break;
                case 'shop':
                    $key = $shopName;
                    break;
                default:
                    $key = $shopName . ' — ' . $ngoLabel;
                    break;
            }

            if (!isset($rows[$key])) {
                $rows[$key] = [
                    'key'        => $key,
                    'shop'       => $shopName,
                    'shop_slug'  => $shopSlug,
                    'ngo'        => $ngoLabel,
                    'ngo_slug'   => $ngoSlug,
                    'orders'     => 0,
                    'order_value'=> 0.0,
                    'commission' => 0.0,
                ];
            }

            $rows[$key]['orders']      += 1;
            $rows[$key]['order_value'] += $orderValue;
            $rows[$key]['commission']  += $commission;

            $grand['orders']      += 1;
            $grand['order_value'] += $orderValue;
            $grand['commission']  += $commission;

            if ($ngoSlug !== '') {
                $slugTotals[$ngoSlug] = ($slugTotals[$ngoSlug] ?? 0) + $commission;
            }
        }

        uasort($rows, function ($a, $b) {
            if ($a['commission'] === $b['commission']) {
                return strcasecmp($a['key'], $b['key']);
            }
            return ($a['commission'] > $b['commission']) ? -1 : 1;
        });

        $rows = array_values($rows);
        if ($limit > 0 && count($rows) > $limit) {
            $rows = array_slice($rows, 0, $limit);
        }

        $slugRank = [];
        if (!empty($slugTotals)) {
            arsort($slugTotals);
            $rankCounter = 1;
            foreach ($slugTotals as $slug => $total) {
                $slugRank[$slug] = $rankCounter++;
            }
        }

        $useModeRates = ($donationRate === null || $donationRate === '' || $donationRate === 'auto');
        if (!$useModeRates) {
            $donationRate = max(0.0, (float) $donationRate);
        }

        $rows = array_map(function ($row) use ($donationRate, $currency, $rateHuf, $useModeRates, $slugRank) {
            $row['order_value'] = round($row['order_value'], 2);
            $row['commission']  = round($row['commission'], 2);
            $slug = $row['ngo_slug'] ?? '';
            $rank = $slugRank[$slug] ?? null;
            if ($useModeRates && $slug !== '' && $rank !== null) {
                $mode = impactshop_rank_mode_for_position($rank);
                $rateToUse = impactshop_mode_donation_rate($mode);
            } elseif ($useModeRates) {
                $mode = 'base';
                $rateToUse = impactshop_mode_donation_rate($mode);
            } else {
                $mode = 'custom';
                $rateToUse = $donationRate;
            }
            $row['rank'] = $rank;
            $row['donation_mode'] = $mode;
            $row['donation_rate'] = $rateToUse;
            $donationEur = round($row['commission'] * $rateToUse, 2);
            $row['donation_eur'] = $donationEur;
            if ($currency === 'HUF') {
                $row['donation_converted'] = round($donationEur * $rateHuf);
                $row['donation_currency']  = 'HUF';
            } else {
                $row['donation_converted'] = $donationEur;
                $row['donation_currency']  = 'EUR';
            }
            return $row;
        }, $rows);

        $payload = [
            'rows' => $rows,
            'meta' => [
                'from'        => $from,
                'to'          => $to,
                'status'      => $status ?: 'all',
                'group'       => $group ?: 'shop_ngo',
                'filters'     => array_filter(['ngo' => $ngoFilter ?: null]),
                'count'       => count($rows),
                'grand'       => [
                    'orders'     => $grand['orders'],
                    'order_value'=> round($grand['order_value'], 2),
                    'commission' => round($grand['commission'], 2),
                ],
                'limit'        => $limit,
                'currency'     => $currency,
                'rate_huf'     => $rateHuf,
                'donation_rate'=> $useModeRates ? null : $donationRate,
                'donation_strategy' => $useModeRates ? 'mode_based' : 'fixed',
                'generated_at'=> current_time('mysql'),
            ],
        ];

        set_transient($cacheKey, $payload, apply_filters('impactshop_totals_cache_ttl', 5 * MINUTE_IN_SECONDS));

        return $payload;
    }
}

function impactshop_rest_totals_endpoint(WP_REST_Request $request)
{
    $from   = $request->get_param('from') ?: date('Y-m-01');
    $to     = $request->get_param('to') ?: date('Y-m-d');
    $status = $request->get_param('status') ?: 'all';
    $group  = $request->get_param('group') ?: 'shop_ngo';
    $ngo    = $request->get_param('ngo') ?: '';
    $limit  = (int) ($request->get_param('limit') ?: 0);
    $currency = strtoupper(sanitize_text_field($request->get_param('currency') ?: 'EUR'));
    $rateHuf = (float) ($request->get_param('rate_huf') ?: (defined('IMPACT_SUM_RATE_HUF') ? IMPACT_SUM_RATE_HUF : 392));
    $donationRate = $request->get_param('donation_rate');

    $data = impactshop_totals_collect($from, $to, $status, $group, $ngo, $limit, $currency, $rateHuf, $donationRate);
    if (is_wp_error($data)) {
        return new WP_REST_Response(
            [
                'code'    => $data->get_error_code(),
                'message' => $data->get_error_message(),
                'details' => $data->get_error_data(),
            ],
            502
        );
    }

    return rest_ensure_response($data);
}

add_action('rest_api_init', function () {
    register_rest_route('impactshop/v1', '/totals', [
        'methods'             => 'GET',
        'callback'            => 'impactshop_rest_totals_endpoint',
        'permission_callback' => '__return_true',
        'args'                => [
            'from'   => ['sanitize_callback' => 'sanitize_text_field'],
            'to'     => ['sanitize_callback' => 'sanitize_text_field'],
            'status' => ['sanitize_callback' => 'sanitize_text_field'],
            'group'  => ['sanitize_callback' => 'sanitize_text_field'],
            'ngo'    => ['sanitize_callback' => 'sanitize_text_field'],
            'limit'  => ['sanitize_callback' => 'absint'],
            'currency' => ['sanitize_callback' => 'sanitize_text_field'],
            'rate_huf' => ['sanitize_callback' => 'sanitize_text_field'],
            'donation_rate' => ['sanitize_callback' => 'sanitize_text_field'],
        ],
    ]);
});
