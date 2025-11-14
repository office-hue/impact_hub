<?php
/**
 * Impact Mini helper functions & shortcodes.
 * Mirrors the WPCode snippet definitions used on staging so legacy widgets work on production.
 */

if (!defined('ABSPATH')) {
    exit;
}

if (!defined('IMPACTSHOP_LEADERBOARD_DEFAULT_FROM')) {
    define('IMPACTSHOP_LEADERBOARD_DEFAULT_FROM', '2025-10-23');
}

if (!function_exists('_ims_from_default')) {
    function _ims_from_default()
    {
        static $cached = null;
        if ($cached !== null) {
            return $cached;
        }

        $candidates = [];

        if (defined('IMPACTSHOP_LEADERBOARD_FROM')) {
            $candidates[] = IMPACTSHOP_LEADERBOARD_FROM;
        }

        if (defined('IMPACTSHOP_LEADERBOARD_DEFAULT_FROM')) {
            $candidates[] = IMPACTSHOP_LEADERBOARD_DEFAULT_FROM;
        }

        $option = get_option('impactshop_leaderboard_from', '');
        if ($option !== '') {
            $candidates[] = $option;
        }

        foreach ($candidates as $candidate) {
            $candidate = trim((string) $candidate);
            if ($candidate === '') {
                continue;
            }
            $timestamp = strtotime($candidate);
            if ($timestamp) {
                return $cached = gmdate('Y-m-d', $timestamp);
            }
        }

        return $cached = date('Y-m-01');
    }
}

if (!function_exists('_ims_today')) {
    function _ims_today()
    {
        return date('Y-m-d');
    }
}

if (!function_exists('_ims_is_unknown')) {
    function _ims_is_unknown($value)
    {
        $n = strtolower(trim((string) $value));
        return (
            $n === '' ||
            strpos($n, 'ismeretlen') !== false ||
            strpos($n, 'unknown') !== false
        );
    }
}

if (!function_exists('_ims_fetch_totals')) {
    function _ims_fetch_totals($args)
    {
        $defaults = [
            'from'   => _ims_from_default(),
            'to'     => _ims_today(),
            'status' => 'all',
            'group'  => 'shop_ngo',
        ];
        $query = array_merge($defaults, $args);
        $url   = add_query_arg($query, home_url('/wp-json/impactshop/v1/totals'));
        $cache = 'ims_tot_' . md5($url);

        $cached = get_transient($cache);
        if ($cached !== false) {
            return $cached;
        }

        $resp = wp_remote_get($url, [
            'timeout' => 12,
            'headers' => ['Accept' => 'application/json'],
        ]);

        if (is_wp_error($resp)) {
            return ['_error' => $resp->get_error_message()];
        }

        $code = wp_remote_retrieve_response_code($resp);
        if ($code < 200 || $code >= 300) {
            return ['_error' => 'HTTP ' . $code];
        }

        $data = json_decode(wp_remote_retrieve_body($resp), true);
        if (!is_array($data)) {
            return ['_error' => 'JSON parse'];
        }

        set_transient($cache, $data, 120);
        return $data;
    }
}

if (!function_exists('_ims_commission_with_unknown')) {
    function _ims_commission_with_unknown($data, $excludeUnknown, $scope)
    {
        $rows = is_array($data['rows'] ?? null) ? $data['rows'] : [];
        if (!$excludeUnknown) {
            return (float) ($data['meta']['grand']['commission'] ?? 0);
        }

        $sum = 0.0;
        foreach ($rows as $row) {
            $ngo  = $row['ngo']  ?? $row['ngo_name']  ?? '';
            $shop = $row['shop'] ?? $row['shop_name'] ?? $row['shop_slug'] ?? '';

            $drop = ($scope === 'ngo')
                ? _ims_is_unknown($ngo)
                : (($scope === 'shop')
                    ? _ims_is_unknown($shop)
                    : (_ims_is_unknown($ngo) || _ims_is_unknown($shop)));

            if ($drop) {
                continue;
            }

            $sum += (float) ($row['commission'] ?? 0);
        }

        if ($sum === 0.0 && !$rows) {
            $sum = (float) ($data['meta']['grand']['commission'] ?? 0);
        }

        return $sum;
    }
}

if (!function_exists('_ims_fmt_money')) {
    function _ims_fmt_money($value, $currency = 'HUF')
    {
        if (strtoupper($currency) === 'HUF') {
            return number_format((float) $value, 0, '.', ' ') . ' Ft';
        }

        return '€ ' . number_format((float) $value, 2, ',', ' ');
    }
}

/**
 * Optional helper shortcode used on staging.
 */
if (!shortcode_exists('impact_sum_mini')) {
    add_shortcode('impact_sum_mini', function ($atts) {
        $a = shortcode_atts([
            'from'            => _ims_from_default(),
            'to'              => '',
            'status'          => 'all',
            'currency'        => 'HUF',
            'rate_huf'        => '392',
            'exclude_unknown' => '1',
            'unknown_scope'   => 'ngo',
            'refresh'         => '60',
            'accent'          => '#7c3aed',
            'label'           => '',
        ], $atts, 'impact_sum_mini');

        $to        = (trim($a['to']) !== '') ? $a['to'] : _ims_today();
        $rate      = (float) $a['rate_huf'];
        $currency  = strtoupper(trim($a['currency']));
        $exclude   = $a['exclude_unknown'] === '1';
        $scope     = in_array($a['unknown_scope'], ['ngo', 'shop', 'both'], true) ? $a['unknown_scope'] : 'ngo';
        $refresh   = max(0, (int) $a['refresh']);
        $accent    = preg_match('~^#([0-9a-f]{3}|[0-9a-f]{6})$~i', $a['accent']) ? $a['accent'] : '#7c3aed';

        $data = _ims_fetch_totals([
            'from'   => $a['from'],
            'to'     => $to,
            'status' => $a['status'],
            'group'  => 'shop_ngo',
        ]);

        if (isset($data['_error'])) {
            return '';
        }

        $commission = _ims_commission_with_unknown($data, $exclude, $scope);
        if ($commission < 0) {
            $commission = 0.0;
        }

        $donEur = $commission * (defined('IMPACT_DONATION_RATE') ? IMPACT_DONATION_RATE : 0.5);
        $amount = ($currency === 'HUF') ? ($donEur * $rate) : $donEur;
        $formatted = _ims_fmt_money($amount, $currency);

        $uid = 'imsum_' . substr(md5($formatted . microtime(true)), 0, 8);

        ob_start(); ?>
        <div class="impact-sum-mini <?php echo esc_attr($uid); ?>"
             data-refresh="<?php echo esc_attr($refresh); ?>"
             style="padding:16px 20px;border-radius:16px;background:#0f172a;color:#f8fafc;
                    display:flex;flex-wrap:wrap;align-items:center;gap:14px;
                    font:15px/1.4 Inter,system-ui;">
          <div style="display:flex;flex-direction:column;gap:4px">
            <?php if (trim($a['label']) !== '') : ?>
              <span style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;opacity:.75">
                <?php echo esc_html($a['label']); ?>
              </span>
            <?php endif; ?>
            <strong style="font-size:26px;font-weight:800;color:<?php echo esc_html($accent); ?>">
              <?php echo esc_html($formatted); ?>
            </strong>
            <span style="font-size:12px;opacity:.65">
              <?php echo esc_html($a['from'] . ' – ' . $to); ?>
            </span>
          </div>
        </div>
        <?php
        return ob_get_clean();
    });
}

if (!function_exists('impactshop_leaderboard_money')) {
    function impactshop_leaderboard_money($value, $currency)
    {
        $currency = strtoupper($currency ?: 'HUF');
        if ($currency === 'HUF') {
            return number_format((float) $value, 0, '.', ' ') . ' Ft';
        }

        return '€ ' . number_format((float) $value, 2, ',', ' ');
    }
}

if (!function_exists('impactshop_leaderboard_shortcode')) {
    function impactshop_leaderboard_shortcode($atts)
    {
        $defaults = [
            'from'          => _ims_from_default(),
            'to'            => '',
            'status'        => 'all',
            'limit'         => '10',
            'currency'      => 'HUF',
            'rate_huf'      => defined('IMPACT_SUM_RATE_HUF') ? (string) IMPACT_SUM_RATE_HUF : '392',
            'donation_rate' => '',
            'collapse'      => '',
            'collapse_title'=> '',
            'collapse_open' => '',
            'collapse_tint' => 'graphite',
        ];

        $a = shortcode_atts($defaults, $atts, 'impact_leaderboard');
        $from   = $a['from'] ?: _ims_from_default();
        $to     = $a['to'] ?: _ims_today();
        $status = $a['status'] ?: 'all';
        $limit  = max(1, (int) $a['limit']);
        $currency = strtoupper($a['currency'] ?: 'HUF');
        $rateHuf  = (float) ($a['rate_huf'] ?: (defined('IMPACT_SUM_RATE_HUF') ? IMPACT_SUM_RATE_HUF : 392));
        $donationRate = ($a['donation_rate'] !== '') ? (float) $a['donation_rate'] : '';

        if (!function_exists('impactshop_totals_collect')) {
            return '<p>Impact leaderboard endpoint unavailable.</p>';
        }

        $ngoData = impactshop_totals_collect($from, $to, $status, 'ngo', '', $limit, $currency, $rateHuf, $donationRate);
        $shopData = impactshop_totals_collect($from, $to, $status, 'shop', '', $limit, $currency, $rateHuf, $donationRate);

        if (is_wp_error($ngoData) || is_wp_error($shopData)) {
            $error = is_wp_error($ngoData) ? $ngoData : $shopData;
            return '<p>' . esc_html($error->get_error_message()) . '</p>';
        }

        $renderList = function ($rows, $scope) use ($currency) {
            if (!is_array($rows) || !$rows) {
                return '<p class="impact-empty">Nincs elérhető adat.</p>';
            }

            $out = '<ol class="impact-list">';
            foreach ($rows as $row) {
                $label = '';
                if ($scope === 'shop') {
                    $label = $row['shop']
                        ?? $row['shop_label']
                        ?? ($row['shop_slug'] ?? '');
                    if ($label === '') {
                        $label = $row['ngo'] ?? ($row['ngo_slug'] ?? '');
                    }
                } else {
                    $label = $row['ngo']
                        ?? $row['ngo_label']
                        ?? ($row['ngo_slug'] ?? '');
                    if ($label === '') {
                        $label = $row['shop'] ?? ($row['shop_slug'] ?? '');
                    }
                }
                if ($label === '') {
                    $label = __('Ismeretlen', 'impactshop');
                }
                $amount = impactshop_leaderboard_money($row['donation_converted'] ?? 0, $currency);
                $out .= '<li><strong>' . esc_html($label) . '</strong><span>' . esc_html($amount) . '</span></li>';
            }
            $out .= '</ol>';
            return $out;
        };

        $uid = 'impact-lb-' . substr(md5(json_encode($a) . microtime(true)), 0, 8);
        $fromDisplay = wp_date(get_option('date_format', 'Y.m.d'), strtotime($from));
        $toDisplay = wp_date(get_option('date_format', 'Y.m.d'), strtotime($to));
        $statusLabel = $status;
        switch (strtolower($status)) {
            case 'approved':
                $statusLabel = __('Csak jóváhagyott', 'impactshop');
                break;
            case 'pending':
                $statusLabel = __('Függőben lévő', 'impactshop');
                break;
            default:
                $statusLabel = __('Összes státusz', 'impactshop');
        }

        $rangeBadge = '<div class="impact-range-badge">'
            . esc_html__('Időszak:', 'impactshop') . ' '
            . '<strong>' . esc_html($fromDisplay) . '</strong>'
            . ' &rarr; '
            . '<strong>' . esc_html($toDisplay) . '</strong>'
            . '<span class="impact-range-status">' . esc_html($statusLabel) . '</span>'
            . '</div>';

        $tabs = '<div class="impact-tabs">
            <button class="impact-tab active" data-impact-tab="ngo">' . esc_html__('Szervezetek', 'impactshop') . '</button>
            <button class="impact-tab" data-impact-tab="shop">' . esc_html__('Webshopok', 'impactshop') . '</button>
        </div>';

        $content = '<div class="impact-card" data-impact-panel="ngo" style="display:block">' . $renderList($ngoData['rows'], 'ngo') . '</div>';
        $content .= '<div class="impact-card" data-impact-panel="shop" style="display:none">' . $renderList($shopData['rows'], 'shop') . '</div>';

        $wrapper = '<div class="impact-wrap" data-impact-lb id="' . esc_attr($uid) . '">' . $rangeBadge . $tabs . $content . '</div>';

        static $impact_lb_styles_added = false;
        $style = '';
        if (!$impact_lb_styles_added) {
            $impact_lb_styles_added = true;
            $style = '<style>
            .impact-range-badge {
                display:inline-flex;
                align-items:center;
                gap:0.35rem;
                margin-bottom:0.85rem;
                padding:0.25rem 0.85rem;
                border-radius:999px;
                background:rgba(15,23,42,0.06);
                font-size:0.82rem;
                color:#475569;
                border:1px solid rgba(15,23,42,0.1);
            }
            .impact-range-badge strong {
                color:#0f172a;
                font-weight:600;
            }
            .impact-range-badge .impact-range-status {
                text-transform:uppercase;
                font-size:0.7rem;
                letter-spacing:0.08em;
                color:#2563eb;
                margin-left:0.5rem;
            }
            </style>';
        }

        $script = '<script>
(function(){
  var root=document.getElementById(' . json_encode($uid) . ');
  if(!root) return;
  var tabs=root.querySelectorAll(\'.impact-tab\');
  var panels=root.querySelectorAll(\'.impact-card\');
  tabs.forEach(function(tab){
    tab.addEventListener(\'click\', function(){
      var target=tab.getAttribute(\'data-impact-tab\');
      tabs.forEach(function(t){ t.classList.toggle(\'active\', t===tab); });
      panels.forEach(function(panel){
        var panelTarget=panel.getAttribute(\'data-impact-panel\');
        panel.style.display = (panelTarget===target) ? \'block\' : \'none\';
      });
    });
  });
})();
</script>';

        $output = $style . $wrapper . $script;

        return $output;
    }

    add_action('init', function () {
        remove_shortcode('impact_leaderboard');
        add_shortcode('impact_leaderboard', 'impactshop_leaderboard_shortcode');
    }, 20);
}

if (!function_exists('impactshop_rank_mode_thresholds')) {
    function impactshop_rank_mode_thresholds(): array
    {
        $defaults = [
            'legend' => 5,
            'rising' => 15,
        ];

        return apply_filters('impactshop_rank_mode_thresholds', $defaults);
    }
}

if (!function_exists('impactshop_rank_mode_for_position')) {
    function impactshop_rank_mode_for_position(int $rank): string
    {
        $thresholds = impactshop_rank_mode_thresholds();
        if ($rank > 0 && $rank <= (int) ($thresholds['legend'] ?? 5)) {
            return 'legend';
        }
        if ($rank > 0 && $rank <= (int) ($thresholds['rising'] ?? 15)) {
            return 'rising';
        }
        return 'base';
    }
}

if (!function_exists('impactshop_mode_donation_rate')) {
    function impactshop_mode_donation_rate(string $mode): float
    {
        $map = [
            'legend' => 0.65,
            'rising' => 0.55,
            'base'   => 0.45,
        ];
        $modeKey = strtolower($mode);
        $rate = $map[$modeKey] ?? $map['base'];

        return (float) apply_filters('impactshop_mode_donation_rate', $rate, $modeKey);
    }
}

if (!function_exists('impactshop_rank_based_donation_rate')) {
    function impactshop_rank_based_donation_rate(int $rank): float
    {
        $mode = impactshop_rank_mode_for_position($rank);
        return impactshop_mode_donation_rate($mode);
    }
}
