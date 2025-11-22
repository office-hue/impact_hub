<?php
/**
 * Impact Social – Ledger Sync
 *
 * Populates the {prefix}_impact_ledger table from live Dognet conversions
 * so the impact_social_ticker shortcode has fresh data without manual runs.
 *
 * Usage (via WP-CLI):
 *   wp eval-file .codex/scripts/impact-social-ledger-sync.php
 *
 * The script is idempotent: rows are keyed by source_ref so repeated runs only
 * upsert newer conversions. It also purges the legacy smoke test entries
 * (channel = 'smoke') and trims the ledger to a configurable size.
 */

if (!defined('ABSPATH')) {
    exit;
}

require_once ABSPATH . 'wp-admin/includes/upgrade.php';

global $wpdb;

$table = $wpdb->prefix . 'impact_ledger';
$charset = $wpdb->get_charset_collate();

$sql = <<<SQL
CREATE TABLE {$table} (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    pseudo_id VARCHAR(12) NOT NULL DEFAULT '',
    ngo_slug VARCHAR(191) NOT NULL DEFAULT '',
    ngo_display VARCHAR(191) NOT NULL DEFAULT '',
    shop_slug VARCHAR(191) NOT NULL DEFAULT '',
    shop_display VARCHAR(191) NOT NULL DEFAULT '',
    amount_huf INT UNSIGNED NOT NULL DEFAULT 0,
    channel VARCHAR(64) NOT NULL DEFAULT 'dognet',
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    happened_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    source_ref VARCHAR(128) NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_source_ref (source_ref),
    KEY idx_status (status),
    KEY idx_happened (happened_at),
    KEY idx_ngo (ngo_slug),
    KEY idx_shop (shop_slug)
) {$charset};
SQL;

dbDelta($sql);

$wpdb->query("DELETE FROM {$table} WHERE channel = 'smoke'");

/**
 * Logging helper.
 */
$impact_social_log = static function (string $message): void {
    if (class_exists('WP_CLI')) {
        \WP_CLI::log($message);
    } else {
        echo $message . PHP_EOL;
    }
};

/**
 * Determine HUF conversion rate.
 */
$impact_social_rate = static function (): float {
    if (function_exists('impactshop_get_huf_rate')) {
        $rate = (float) impactshop_get_huf_rate();
        if ($rate > 0) {
            return $rate;
        }
    }
    if (defined('IMPACTSHOP_FX_HUF')) {
        return max(1.0, (float) IMPACTSHOP_FX_HUF);
    }
    return 392.0;
};

/**
 * Build campaign (shop) lookup keyed by Dognet campaign_id.
 */
$impact_social_shop_map = static function (): array {
    $map = [];
    if (!function_exists('impactshop_get_shops') || !function_exists('dognet_extract_campaign_id_from_base')) {
        return $map;
    }

    foreach ((array) impactshop_get_shops() as $shop) {
        $cid = 0;
        if (!empty($shop['dognet_base'])) {
            $cid = (int) dognet_extract_campaign_id_from_base($shop['dognet_base']);
        }
        if (!$cid) {
            continue;
        }
        $map[$cid] = [
            'slug' => sanitize_title($shop['shop_slug'] ?? ''),
            'name' => $shop['name'] ?? ('cid ' . $cid),
        ];
    }

    return $map;
};

/**
 * Resolve NGO display name.
 */
$impact_social_ngo_display = static function (string $slug): string {
    $slug = sanitize_title($slug);
    if ($slug === '') {
        return '';
    }
    if (function_exists('impactshop_resolve_ngo_name')) {
        $name = impactshop_resolve_ngo_name($slug);
        if ($name) {
            return $name;
        }
    }
    return ucwords(str_replace('-', ' ', $slug));
};

/**
 * Resolve shop display name.
 */
$impact_social_shop_display = static function (string $slug): string {
    $slug = sanitize_title($slug);
    if ($slug === '') {
        return '';
    }
    if (function_exists('impactshop_resolve_shop_name_by_slug')) {
        $name = impactshop_resolve_shop_name_by_slug($slug);
        if ($name) {
            return $name;
        }
    }
    return ucwords(str_replace('-', ' ', $slug));
};

/**
 * Generate a stable pseudo identifier.
 */
$impact_social_pseudo = static function (array $item, string $sourceRef): string {
    $candidates = [];

    if (!empty($item['user']) && is_array($item['user'])) {
        foreach (['original_id', 'refid', 'id'] as $key) {
            if (!empty($item['user'][$key]) && is_scalar($item['user'][$key])) {
                $candidates[] = (string) $item['user'][$key];
            }
        }
    }

    foreach (['original_id', 'order_id', 'transaction_id', 'id'] as $key) {
        if (!empty($item[$key]) && is_scalar($item[$key])) {
            $candidates[] = (string) $item[$key];
        }
    }

    $candidates[] = $sourceRef;

    foreach ($candidates as $seed) {
        $clean = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) $seed));
        if ($clean !== '') {
            return substr($clean, 0, 6);
        }
    }

    return strtoupper(substr(md5($sourceRef), 0, 6));
};

/**
 * Determine NGO slug from a Dognet row.
 */
$impact_social_pick_ngo = static function (array $row): string {
    if (function_exists('impactshop_pick_ngo_from_row')) {
        $slug = impactshop_pick_ngo_from_row($row);
        if ($slug) {
            return sanitize_title($slug);
        }
    }

    foreach (['last_click_data1', 'data1', 'ngo_slug'] as $key) {
        if (!empty($row[$key]) && is_scalar($row[$key])) {
            return sanitize_title((string) $row[$key]);
        }
    }

    return '';
};

/**
 * Extract commission value from a conversion row (EUR).
 */
$impact_social_commission = static function (array $row): float {
    if (function_exists('ism_num')) {
        return (float) ism_num($row);
    }
    foreach (['publisher_commission', 'commission', 'payout', 'publisherPayout', 'commission_publisher'] as $key) {
        if (isset($row[$key]) && is_numeric($row[$key])) {
            return (float) $row[$key];
        }
    }
    return 0.0;
};

$rate = $impact_social_rate();
$shopMap = $impact_social_shop_map();
$maxRows = (int) apply_filters('impact_social_ledger_max_rows', 150);
$maxRows = $maxRows > 0 ? $maxRows : 150;

$fromDays = (int) apply_filters('impact_social_ledger_days', 45);
$fromDays = max(7, $fromDays);
$fromDate = gmdate('Y-m-d', strtotime("-{$fromDays} days"));
$toDate = gmdate('Y-m-d');

$items = [];
if (function_exists('dognet_api_list_conversions_all')) {
    $resp = dognet_api_list_conversions_all($fromDate, $toDate, 'all', 60, 200);
    if (is_array($resp) && !empty($resp['items']) && is_array($resp['items'])) {
        $items = $resp['items'];
    }
}

if (!$items && function_exists('ims_strict_fetch')) {
    $fallback = ims_strict_fetch([
        'from'  => $fromDate,
        'to'    => $toDate,
        'limit' => $maxRows,
    ]);
    if (is_array($fallback['rows'] ?? null)) {
        $items = $fallback['rows'];
    }
}

if (!$items) {
    $impact_social_log('ℹ️  Impact Social ledger sync: no source conversions found.');
    return;
}

usort($items, static function ($a, $b) {
    $at = strtotime($a['created_at'] ?? $a['datetime'] ?? 'now');
    $bt = strtotime($b['created_at'] ?? $b['datetime'] ?? 'now');
    return $bt <=> $at;
});

$items = array_slice($items, 0, $maxRows);

$inserted = 0;
$updated = 0;

foreach ($items as $row) {
    $sourceId = $row['id'] ?? ($row['transaction_id'] ?? null);
    if (!$sourceId) {
        continue;
    }
    $sourceRef = 'dognet:' . $sourceId;

    $ngoSlug = $impact_social_pick_ngo($row);
    $ngoDisplay = $impact_social_ngo_display($ngoSlug ?: 'ismeretlen-ngo');

    $campaignId = isset($row['campaign_id']) ? (int) $row['campaign_id'] : 0;
    $shopSlug = $shopMap[$campaignId]['slug'] ?? sanitize_title($row['shop_slug'] ?? ($row['campaign']['name'] ?? 'ismeretlen-shop'));
    if ($shopSlug === '') {
        $shopSlug = 'ismeretlen-shop';
    }
    $shopDisplay = $shopMap[$campaignId]['name'] ?? ($row['shop_name'] ?? ($row['campaign']['name'] ?? $impact_social_shop_display($shopSlug)));
    if (!$shopDisplay) {
        $shopDisplay = $impact_social_shop_display($shopSlug);
    }

    $commission = $impact_social_commission($row);
    $donationEur = function_exists('ims_donation_eur') ? ims_donation_eur($commission) : round($commission * 0.5, 2);
    $amountHuf = function_exists('impactshop_convert_to_huf')
        ? (int) impactshop_convert_to_huf($donationEur, $rate)
        : (int) round($donationEur * $rate);

    $statusRaw = strtoupper(trim((string) ($row['rstatus'] ?? $row['status'] ?? '')));
    $statusMap = [
        'A' => 'approved',
        'P' => 'pending',
        'D' => 'declined',
        'R' => 'rejected',
    ];
    $status = $statusMap[$statusRaw] ?? ($statusRaw ?: 'pending');
    if ($status === 'rejected') {
        $status = 'declined';
    }

    $happenedAt = $row['created_at'] ?? ($row['datetime'] ?? gmdate('Y-m-d H:i:s'));
    $happenedAt = gmdate('Y-m-d H:i:s', strtotime($happenedAt));

    $pseudoId = $impact_social_pseudo($row, $sourceRef);

    $data = [
        'pseudo_id'    => $pseudoId,
        'ngo_slug'     => $ngoSlug,
        'ngo_display'  => $ngoDisplay,
        'shop_slug'    => $shopSlug,
        'shop_display' => $shopDisplay,
        'amount_huf'   => max(0, $amountHuf),
        'channel'      => 'dognet',
        'status'       => $status,
        'happened_at'  => $happenedAt,
        'source_ref'   => $sourceRef,
    ];

    $formats = ['%s','%s','%s','%s','%s','%d','%s','%s','%s'];

    $existingId = $wpdb->get_var($wpdb->prepare("SELECT id FROM {$table} WHERE source_ref = %s", $sourceRef));
    if ($existingId) {
        $wpdb->update($table, $data, ['id' => $existingId], $formats, ['%d']);
        $updated++;
    } else {
        $wpdb->insert($table, $data, $formats);
        if ($wpdb->insert_id) {
            $inserted++;
        }
    }
}

$impact_social_log(sprintf('✅ Impact Social ledger sync: %d inserted, %d updated (rate %.2f HUF/EUR)', $inserted, $updated, $rate));

$totalRows = (int) $wpdb->get_var("SELECT COUNT(*) FROM {$table}");
if ($totalRows > $maxRows) {
    $offset = $maxRows;
    $idsToDelete = $wpdb->get_col($wpdb->prepare(
        "SELECT id FROM {$table} ORDER BY happened_at DESC, id DESC LIMIT 18446744073709551615 OFFSET %d",
        $offset
    ));
    if ($idsToDelete) {
        $idsSql = implode(',', array_map('intval', $idsToDelete));
        $wpdb->query("DELETE FROM {$table} WHERE id IN ({$idsSql})");
    }
}

$like = $wpdb->esc_like('_transient_impact_social_ticker_') . '%';
$timeoutLike = $wpdb->esc_like('_transient_timeout_impact_social_ticker_') . '%';
$wpdb->query($wpdb->prepare("DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s", $like, $timeoutLike));

$impact_social_log('ℹ️  Impact Social ledger sync: ticker transients cleared.');
