<?php
/**
 * Plugin Name: Impact Social MVP
 * Description: Minimal social ticker REST API + shortcode scaffold for Impact Shop.
 * Author: Arnold (solo operator)
 */

declare(strict_types=1);

if (! defined('ABSPATH')) {
    exit;
}

if (! class_exists('Impact_Social_MVP')) {
    final class Impact_Social_MVP
    {
        private const DEFAULT_LIMIT = 10;
        private const PSEUDO_LENGTH = 12;
        private static $assets_enqueued = false;

        public static function bootstrap(): void
        {
            if (! self::is_enabled()) {
                return;
            }

            add_action('rest_api_init', [__CLASS__, 'register_routes']);
            add_shortcode('impact_social_ticker', [__CLASS__, 'render_shortcode']);
            add_action('wp_enqueue_scripts', [__CLASS__, 'enqueue_assets']);
        }

        public static function enqueue_assets(): void
        {
            if (self::$assets_enqueued) {
                return;
            }

            $css = <<<CSS
.impact-social-ticker {margin:1.5rem 0;padding:1.05rem;border:1px solid rgba(15,23,42,0.08);border-radius:16px;background:#ffffff;box-shadow:0 18px 36px rgba(15,23,42,0.08);}
.impact-social-ticker--dark {background:#0f172a;color:#f8fafc;border-color:rgba(248,250,252,0.08);}
.impact-social-ticker__list {list-style:none;margin:0;padding:0;display:grid;gap:1.25rem;}
.impact-social-ticker--grid .impact-social-ticker__list {grid-template-columns:repeat(auto-fit,minmax(260px,1fr));}
.impact-social-ticker__item {padding:1.1rem;border-radius:14px;border:1px solid rgba(15,23,42,0.06);background:#f9fafc;transition:transform .2s ease,box-shadow .2s ease;}
.impact-social-ticker__item:hover {transform:translateY(-2px);box-shadow:0 16px 28px rgba(15,23,42,0.12);}
.impact-social-ticker__item--owner {border-color:#4f46e5;background:rgba(79,70,229,0.08);box-shadow:0 18px 36px rgba(79,70,229,0.18);}
.impact-social-ticker__headline {font-size:0.95rem;font-weight:600;color:#1e293b;display:flex;flex-wrap:wrap;gap:.4rem;align-items:center;line-height:1.45;}
.impact-social-ticker__initials {background:#4f46e5;color:#fff;font-size:0.75rem;padding:0.25rem 0.55rem;border-radius:999px;letter-spacing:0.05em;text-transform:uppercase;box-shadow:0 6px 12px rgba(79,70,229,0.35);}
.impact-social-ticker__badge {display:inline-flex;align-items:center;background:#16a34a;color:#fff;font-size:0.68rem;font-weight:700;margin-right:.4rem;padding:0.18rem 0.55rem;border-radius:999px;text-transform:uppercase;letter-spacing:0.1em;}
.impact-social-ticker__meta {margin-top:.55rem;font-size:0.78rem;color:#475569;display:flex;flex-wrap:wrap;gap:.9rem;align-items:center;}
.impact-social-ticker__status {text-transform:uppercase;font-size:0.7rem;font-weight:700;letter-spacing:0.14em;color:#2563eb;}
.impact-social-ticker__status--pending {color:#ca8a04;}
.impact-social-ticker__cta {margin-top:.85rem;display:flex;flex-direction:column;gap:.4rem;}
.impact-social-ticker__share-buttons {display:flex;flex-wrap:wrap;gap:.45rem;}
.impact-social-ticker__share-btn {display:inline-flex;align-items:center;justify-content:center;gap:.45rem;padding:.55rem 1.05rem;border-radius:999px;background:#2563eb;color:#fff;font-weight:600;font-size:0.8rem;text-decoration:none;border:none;cursor:pointer;transition:transform .2s ease,box-shadow .2s ease,background .2s ease;box-shadow:0 10px 20px rgba(37,99,235,0.22);}
.impact-social-ticker__share-btn:hover {transform:translateY(-1px);box-shadow:0 14px 28px rgba(37,99,235,0.25);}
.impact-social-ticker__share-btn:focus {outline:2px solid #1d4ed8;outline-offset:2px;}
.impact-social-ticker__share-icon {display:inline-flex;width:1.05rem;height:1.05rem;}
.impact-social-ticker__share-icon svg {width:100%;height:100%;fill:currentColor;}
.impact-social-ticker__share-label {display:inline-flex;align-items:center;line-height:1;}
.impact-social-ticker__share-btn--x {background:#0f172a;}
.impact-social-ticker__share-btn--linkedin {background:#0a66c2;}
.impact-social-ticker__share-btn--messenger {background:#0084ff;}
.impact-social-ticker__share-btn--threads,.impact-social-ticker__share-btn--instagram,.impact-social-ticker__share-btn--tiktok {background:#1f2937;}
.impact-social-ticker__share-btn--copy {background:#0ea5e9;color:#041b2d;font-weight:700;border:2px solid rgba(10,44,62,0.15);box-shadow:0 16px 32px rgba(14,165,233,0.35);}
.impact-social-ticker__share-btn--copy .impact-social-ticker__share-label {font-weight:700;}
.impact-social-ticker__share-btn--copied {background:#16a34a;}
.impact-social-ticker__hint {font-size:0.72rem;color:#475569;}
.impact-social-ticker__cta--info,.impact-social-ticker__cta--pending {font-size:0.72rem;color:#475569;background:rgba(15,23,42,0.05);padding:.55rem .8rem;border-radius:10px;}
.impact-social-ticker--dark .impact-social-ticker__item {background:rgba(255,255,255,0.06);border-color:rgba(255,255,255,0.08);}
.impact-social-ticker--dark .impact-social-ticker__headline {color:#e2e8f0;}
.impact-social-ticker--dark .impact-social-ticker__meta {color:#cbd5f5;}
.impact-social-ticker--dark .impact-social-ticker__share-btn {box-shadow:0 10px 20px rgba(99,102,241,0.25);}
.impact-social-ticker__empty {margin:0;font-size:0.9rem;color:#475569;text-align:center;}
@media (max-width:640px){.impact-social-ticker__headline{flex-direction:column;align-items:flex-start;}}
CSS;

            wp_register_style('impact-social-mvp', false);
            wp_enqueue_style('impact-social-mvp');
            wp_add_inline_style('impact-social-mvp', $css);

            $js = <<<JS
(function(){
  function copyToClipboard(btn,message){
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(message).then(function(){
        btn.classList.add('impact-social-ticker__share-btn--copied');
        setTimeout(function(){ btn.classList.remove('impact-social-ticker__share-btn--copied'); }, 2000);
      }).catch(function(){
        window.prompt('Másold ki a megosztáshoz:', message);
      });
    } else {
      window.prompt('Másold ki a megosztáshoz:', message);
    }
  }

  document.addEventListener('click', function(event){
    var btn = event.target.closest('.impact-social-ticker__share-btn');
    if (!btn) {
      return;
    }

    var type = btn.getAttribute('data-share-type') || 'url';
    if (type === 'copy') {
      event.preventDefault();
      var message = btn.getAttribute('data-share-message') || '';
      if (message) {
        copyToClipboard(btn, message);
      }
    }
  });
})();
JS;

            wp_register_script('impact-social-mvp', '', [], null, true);
            wp_enqueue_script('impact-social-mvp');
            wp_add_inline_script('impact-social-mvp', $js);

            self::$assets_enqueued = true;
        }

        private static function is_enabled(): bool
        {
            if (defined('IMPACT_SOCIAL_MVP_ENABLED')) {
                return (bool) IMPACT_SOCIAL_MVP_ENABLED;
            }

            $option = get_option('impact_social_mvp_enabled');
            return (bool) $option;
        }

        public static function register_routes(): void
        {
            register_rest_route(
                'impact/v1',
                '/social/ticker',
                [
                    'methods'             => 'GET',
                    'callback'            => [__CLASS__, 'handle_ticker_request'],
                    'permission_callback' => '__return_true',
                    'args'                => [
                        'limit' => [
                            'description'       => 'Number of records to return.',
                            'type'              => 'integer',
                            'default'           => self::DEFAULT_LIMIT,
                            'sanitize_callback' => 'absint',
                            'validate_callback' => static function ($value): bool {
                                return $value > 0 && $value <= 50;
                            },
                        ],
                        'status' => [
                            'description'       => 'Ledger status filter (approved, pending, all).',
                            'type'              => 'string',
                            'default'           => 'approved',
                            'sanitize_callback' => [__CLASS__, 'sanitize_status'],
                            'validate_callback' => static function ($value): bool {
                                $value = strtolower((string) $value);
                                return in_array($value, ['approved', 'pending', 'all'], true);
                            },
                        ],
                    ],
                ]
            );
        }

        public static function handle_ticker_request(\WP_REST_Request $request): \WP_REST_Response
        {
            $limit = (int) $request->get_param('limit');
            if ($limit < 1 || $limit > 50) {
                $limit = self::DEFAULT_LIMIT;
            }

            $statusParam = (string) ($request->get_param('status') ?: 'approved');
            $statuses = self::resolve_statuses($statusParam);

            $records = self::query_ledger($limit, $statuses);

            return new \WP_REST_Response(
                [
                    'data'       => $records,
                    'meta'       => [
                        'count' => count($records),
                        'limit' => $limit,
                        'status'=> $statusParam,
                    ],
                    'generated'  => gmdate('c'),
                ]
            );
        }

        public static function sanitize_status($value): string
        {
            $value = strtolower(trim((string) $value));
            if (! in_array($value, ['approved', 'pending', 'all'], true)) {
                return 'approved';
            }
            return $value;
        }

        /**
         * @return string[]
         */
        private static function resolve_statuses(string $statusParam): array
        {
            $statusParam = strtolower($statusParam);
            if ($statusParam === 'all') {
                return [];
            }

            if ($statusParam === 'pending') {
                return ['pending'];
            }

            return ['approved'];
        }

        private static function query_ledger(int $limit, array $statuses): array
        {
            global $wpdb;

            $table = $wpdb->prefix . 'impact_ledger';
            $limit = max(1, min($limit, 50));

            $sql = "SELECT pseudo_id, ngo_slug, ngo_display, shop_slug, shop_display, amount_huf, channel, status, happened_at
                     FROM {$table}";

            $params = [];
            if (! empty($statuses)) {
                $placeholders = implode(',', array_fill(0, count($statuses), '%s'));
                $sql .= " WHERE status IN ({$placeholders})";
                $params = array_merge($params, $statuses);
            } else {
                $sql .= " WHERE status IN ('approved','pending')";
            }

            $sql .= " ORDER BY happened_at DESC LIMIT %d";
            $params[] = $limit;

            // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
            $rows = $wpdb->get_results($wpdb->prepare($sql, $params), ARRAY_A);

            if (empty($rows)) {
                return [];
            }

            $domain = home_url('/go/');

            $currentPseudo = self::get_current_pseudo();

            return array_map(
                static function (array $row) use ($domain, $currentPseudo): array {
                    $rawPseudo = (string) ($row['pseudo_id'] ?? '');
                    $initials = self::mask_pseudo($rawPseudo);
                    $normalizedPseudo = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $rawPseudo));
                    $ngoSlug = sanitize_title($row['ngo_slug'] ?? '');
                    $ngoName = sanitize_text_field($row['ngo_display'] ?? $ngoSlug);
                    $amount = (int) ($row['amount_huf'] ?? 0);
                    $shopSlug = sanitize_title($row['shop_slug'] ?? '');
                    $shopName = sanitize_text_field($row['shop_display'] ?? $shopSlug);
                    $channel = sanitize_key($row['channel'] ?? 'unknown');
                    $timestampRaw = $row['happened_at'] ?? gmdate('c');
                    $ts = strtotime($timestampRaw) ?: time();
                    $timestampIso = gmdate('c', $ts);
                    $timestampDisplay = wp_date('Y-m-d H:i T', $ts);
                    $status = strtolower($row['status'] ?? 'approved');

                    $isOwner = $currentPseudo && $normalizedPseudo !== '' && $normalizedPseudo === $currentPseudo;
                    $shareMessage = null;
                    $shareLinks = [];

                    $landingUrl = add_query_arg(
                        [
                            'd1'          => $ngoSlug,
                            'ngo'         => $ngoSlug,
                            'shop'        => $shopSlug,
                            'utm_source'  => 'impacthub_social',
                            'utm_medium'  => 'share',
                            'utm_campaign'=> 'sprint7_mvp',
                        ],
                        $domain
                    );

                    if ($isOwner && in_array($status, ['approved', 'pending'], true)) {
                        $shareMessage = self::build_share_message($ngoName, $shopName, $amount, $status);
                        $shareLinks = self::build_share_links($landingUrl, $shareMessage);
                    }

                    return [
                        'pseudo_initials' => $initials,
                        'ngo_slug'        => $ngoSlug,
                        'ngo_display'     => $ngoName,
                        'shop_slug'       => $shopSlug,
                        'shop_display'    => $shopName,
                        'amount_huf'      => $amount,
                        'channel'         => $channel,
                        'status'          => $status,
                        'happened_at'     => $timestampIso,
                        'happened_at_display' => $timestampDisplay,
                        'is_owner'        => (bool) $isOwner,
                        'can_share'       => (bool) ($isOwner && in_array($status, ['approved', 'pending'], true)),
                        'share_links'     => $shareLinks,
                        'share_message'   => $shareMessage,
                        'landing_url'     => esc_url_raw($landingUrl),
                    ];
                },
                $rows
            );
        }

        private static function mask_pseudo(string $pseudoId): string
        {
            if ($pseudoId === '') {
                return '??*';
            }

            $clean = preg_replace('/[^A-Za-z0-9]/', '', $pseudoId);
            if ($clean === '') {
                return '??*';
            }

            return strtoupper(substr($clean, 0, 2)) . '*';
        }

        private static function get_current_pseudo(): ?string
        {
            $candidates = [
                $_COOKIE['impactshop_pseudo_id'] ?? null,
                $_COOKIE['impact_pseudo_id'] ?? null,
                $_COOKIE['impact_pseudo'] ?? null,
                $_GET['impact_pseudo_id'] ?? null,
            ];

            foreach ($candidates as $candidate) {
                if (! $candidate) {
                    continue;
                }

                $clean = preg_replace('/[^A-Za-z0-9]/', '', (string) $candidate);
                if ($clean !== '') {
                    return strtoupper(substr($clean, 0, self::PSEUDO_LENGTH));
                }
            }

            return null;
        }

        private static function build_share_message(string $ngoName, string $shopName, int $amount, string $status): string
        {
            $formatted = number_format_i18n($amount);
            return sprintf('Én most támogattam a %s ügyét %s Ft-tal a(z) %s vásárlással az Impact Shopban.', $ngoName, $formatted, $shopName !== '' ? $shopName : 'Impact Shop');
        }

        private static function build_share_links(string $landingUrl, string $shareMessage): array
        {
            $encodedLanding = rawurlencode($landingUrl);
            $encodedMessage = rawurlencode($shareMessage);

            return [
                [
                    'platform' => 'copy',
                    'label'    => 'Szöveg másolása',
                    'type'     => 'copy',
                    'message'  => $shareMessage,
                ],
                [
                    'platform' => 'facebook',
                    'label'    => 'Facebook',
                    'type'     => 'url',
                    'url'      => esc_url_raw("https://www.facebook.com/sharer/sharer.php?u={$encodedLanding}&quote={$encodedMessage}"),
                ],
                [
                    'platform' => 'x',
                    'label'    => 'X',
                    'type'     => 'url',
                    'url'      => esc_url_raw("https://twitter.com/intent/tweet?text={$encodedMessage}&url={$encodedLanding}"),
                ],
                [
                    'platform' => 'linkedin',
                    'label'    => 'LinkedIn',
                    'type'     => 'url',
                    'url'      => esc_url_raw("https://www.linkedin.com/sharing/share-offsite/?url={$encodedLanding}"),
                ],
                [
                    'platform' => 'messenger',
                    'label'    => 'Messenger',
                    'type'     => 'url',
                    'url'      => esc_url_raw("https://m.me/?link={$encodedLanding}&text={$encodedMessage}"),
                ],
                [
                    'platform' => 'threads',
                    'label'    => 'Threads',
                    'type'     => 'copy',
                    'message'  => $shareMessage,
                ],
                [
                    'platform' => 'instagram',
                    'label'    => 'Instagram',
                    'type'     => 'copy',
                    'message'  => $shareMessage,
                ],
                [
                    'platform' => 'tiktok',
                    'label'    => 'TikTok',
                    'type'     => 'copy',
                    'message'  => $shareMessage,
                ],
                [
                    'platform' => 'copy',
                    'label'    => 'Szöveg másolása',
                    'type'     => 'copy',
                    'message'  => $shareMessage,
                ],
            ];
        }

        private static function share_icon_markup(string $platform): string
        {
            $platform = strtolower($platform);
            switch ($platform) {
                case 'facebook':
                    $svg = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><path d="M22 12a10 10 0 1 0-11.6 9.87v-6.99h-2.4V12h2.4V9.8c0-2.37 1.42-3.68 3.6-3.68 1.04 0 2.14.18 2.14.18v2.35h-1.21c-1.19 0-1.56.74-1.56 1.5V12h2.65l-.42 2.88h-2.23v6.99A10 10 0 0 0 22 12Z"></path></svg>';
                    break;
                case 'x':
                    $svg = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><path d="M4 3h4.74l3.04 4.69L15.1 3H20l-5.86 7.05L22 21h-4.74l-3.42-5.2L9.2 21H4l6.41-7.95L4 3Zm3.48 2 3.37 5.04L7.12 19h1.68l3.33-4.98L16.87 19h1.74l-3.81-6.08L18.92 5h-1.68l-3.23 4.78L10.83 5H7.48Z"></path></svg>';
                    break;
                case 'linkedin':
                    $svg = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Zm.02 5.75H2V21h3V9.25Zm4 0H9V21h3v-6.62c0-1.76.33-3.46 2.51-3.46 2.14 0 2.18 2.02 2.18 3.58V21h3v-6.97c0-3.37-.73-5.97-4.66-5.97-1.95 0-3.25 1.07-3.78 2.09h-.05V9.25Z"></path></svg>';
                    break;
                case 'messenger':
                    $svg = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.02 2 10.78c0 2.69 1.23 5.1 3.23 6.73v3.49l2.96-1.63c1.01.28 2.08.43 3.19.43 5.52 0 10-4.02 10-8.78S17.52 2 12 2Zm.47 11.78-2.52-2.68-4.85 2.68 5.34-5.7 2.46 2.7 4.93-2.7-5.36 5.7Z"></path></svg>';
                    break;
                case 'threads':
                    $svg = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><path d="M12 2.5c5.25 0 9.5 3.93 9.5 9.5S17.7 21.5 12 21.5 2.5 17.57 2.5 12 6.75 2.5 12 2.5Zm4.32 8.24c-.35-2.14-2.35-3.4-4.85-3.4-2.74 0-4.88 1.53-4.88 3.56 0 1.78 1.28 3 3.34 3.37v1.77c-2.78-.42-4.66-2.36-4.66-5.14 0-3.08 2.74-5.36 6.2-5.36 3.26 0 5.8 1.88 6.27 4.7.42 2.6-1.01 4.39-3.52 4.96a6.1 6.1 0 0 1-3.3-.26v-1.84c1.22.27 2.34.2 3.16-.17.85-.38 1.21-1.02 1.04-1.79Z"></path></svg>';
                    break;
                case 'instagram':
                    $svg = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><path d="M12 2.5c3.07 0 3.45.01 4.66.07 1.2.06 1.99.25 2.45.42a4 4 0 0 1 1.45.94 4 4 0 0 1 .94 1.45c.17.46.36 1.25.42 2.45.06 1.21.07 1.59.07 4.66s-.01 3.45-.07 4.66c-.06 1.2-.25 1.99-.42 2.45a4 4 0 0 1-.94 1.45 4 4 0 0 1-1.45.94c-.46.17-1.25.36-2.45.42-1.21.06-1.59.07-4.66.07s-3.45-.01-4.66-.07c-1.2-.06-1.99-.25-2.45-.42a4 4 0 0 1-1.45-.94 4 4 0 0 1-.94-1.45c-.17-.46-.36-1.25-.42-2.45C2.51 15.45 2.5 15.07 2.5 12s.01-3.45.07-4.66c.06-1.2.25-1.99.42-2.45a4 4 0 0 1 .94-1.45 4 4 0 0 1 1.45-.94c.46-.17 1.25-.36 2.45-.42C8.55 2.51 8.93 2.5 12 2.5Zm0 3a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Zm5.25-.75a1.05 1.05 0 1 0 0 2.1 1.05 1.05 0 0 0 0-2.1Zm-5.25 3.15a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z"></path></svg>';
                    break;
                case 'tiktok':
                    $svg = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><path d="M15.75 3c1.18 1.3 2.76 2.11 4.5 2.2v3.68a8.51 8.51 0 0 1-4.5-1.23v6.92a6.24 6.24 0 1 1-5.38-6.18v3.78a2.49 2.49 0 1 0 3.59 2.25V3h1.79Z"></path></svg>';
                    break;
                case 'copy':
                    $svg = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><path d="M16 1H6a2 2 0 0 0-2 2v12h2V3h10V1Zm3 4H10a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 14H10V7h9v12Z"></path></svg>';
                    break;
                default:
                    $svg = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle></svg>';
                    break;
            }

            return '<span class="impact-social-ticker__share-icon">' . $svg . '</span>';
        }

        public static function render_shortcode(array $attrs = [], string $content = null, string $tag = ''): string
        {
            if (! self::is_enabled()) {
                return '<div class="impact-social-ticker impact-social-ticker--disabled">A közösségi ticker jelenleg inaktív.</div>';
            }

            $atts = shortcode_atts(
                [
                    'limit'  => self::DEFAULT_LIMIT,
                    'layout' => 'list',
                    'theme'  => 'light',
                    'status' => 'all',
                ],
                $attrs,
                $tag
            );

            $currentPseudo = self::get_current_pseudo() ?: 'anon';
            $cacheKey = 'impact_social_ticker_' . md5($currentPseudo . '|' . serialize($atts));
            $cached = get_transient($cacheKey);
            if ($cached !== false) {
                return $cached;
            }

            $request = new \WP_REST_Request('GET', '/impact/v1/social/ticker');
            $request->set_param('limit', (int) $atts['limit']);
            $request->set_param('status', self::sanitize_status($atts['status']));
            $response = rest_do_request($request);

            if ($response->is_error()) {
                return '<div class="impact-social-ticker impact-social-ticker--error">A közösségi ticker jelenleg nem elérhető.</div>';
            }

            $data = $response->get_data();
            $items = $data['data'] ?? [];

            $html = self::render_markup($items, $atts['layout'], $atts['theme']);
            set_transient($cacheKey, $html, MINUTE_IN_SECONDS);

            return $html;
        }

        private static function render_markup(array $items, string $layout, string $theme): string
        {
            $layoutClass = $layout === 'grid' ? 'impact-social-ticker--grid' : 'impact-social-ticker--list';
            $themeClass = $theme === 'dark' ? 'impact-social-ticker--dark' : 'impact-social-ticker--light';

            if (empty($items)) {
                return '<div class="impact-social-ticker ' . esc_attr($layoutClass . ' ' . $themeClass) . '"><p class="impact-social-ticker__empty">Légy te az első, aki támogat!</p></div>';
            }

            $rows = array_map(
                static function (array $item): string {
                    $amount = number_format_i18n((int) ($item['amount_huf'] ?? 0));
                    $ngo = esc_html($item['ngo_display'] ?? $item['ngo_slug'] ?? '');
                    $shop = esc_html($item['shop_display'] ?? $item['shop_slug'] ?? '');
                    $initials = esc_html($item['pseudo_initials'] ?? '??*');
                    $channel = esc_html($item['channel'] ?? '');
                    $timestamp = esc_html($item['happened_at'] ?? '');
                    $statusRaw = strtolower($item['status'] ?? 'approved');
                    $status = esc_html($statusRaw);
                    $isOwner = ! empty($item['is_owner']);
                    $shareLinksData = is_array($item['share_links'] ?? null) ? $item['share_links'] : [];
                    $shareMessage = isset($item['share_message']) ? (string) $item['share_message'] : '';
                    $canShare = ! empty($item['can_share']) && ! empty($shareLinksData);

                    $cta = '';
                    if ($canShare) {
                        $hint = '';
                        if ($status === 'pending') {
                            $hint = '<span class="impact-social-ticker__hint">Jóváhagyásra vár – általában pár perc, de már megoszthatod.</span>';
                        }

                        $buttons = [];
                        foreach ($shareLinksData as $link) {
                            if (! is_array($link)) {
                                continue;
                            }
                            $platform = isset($link['platform']) ? sanitize_title($link['platform']) : 'share';
                            $label = esc_html($link['label'] ?? ucfirst($platform));
                            $type = $link['type'] ?? 'url';
                            $icon = self::share_icon_markup($platform);
                            $labelMarkup = '<span class="impact-social-ticker__share-label">' . $label . '</span>';

                            if ($type === 'copy') {
                                $message = isset($link['message']) ? esc_attr($link['message']) : esc_attr($shareMessage);
                                $buttons[] = sprintf(
                                    '<button type="button" class="impact-social-ticker__share-btn impact-social-ticker__share-btn--%1$s" data-share-type="copy" data-share-platform="%1$s" data-share-message="%2$s">%3$s%4$s</button>',
                                    $platform,
                                    $message,
                                    $icon,
                                    $labelMarkup
                                );
                                continue;
                            }

                            $url = esc_url($link['url'] ?? '#');
                            $fallback = ! empty($link['fallback']) ? ' data-share-fallback="' . esc_url($link['fallback']) . '"' : '';
                            $buttons[] = sprintf(
                                '<a href="%2$s" class="impact-social-ticker__share-btn impact-social-ticker__share-btn--%1$s" target="_blank" rel="noopener" data-share-type="url" data-share-platform="%1$s"%3$s>%4$s%5$s</a>',
                                $platform,
                                $url,
                                $fallback,
                                $icon,
                                $labelMarkup
                            );
                        }

                        $buttonsHtml = implode('', $buttons);
                        $cta = '<div class="impact-social-ticker__cta"><div class="impact-social-ticker__share-buttons">' . $buttonsHtml . '</div>' . $hint . '</div>';
                    } elseif ($isOwner) {
                        $cta = '<div class="impact-social-ticker__cta impact-social-ticker__cta--pending">Támogatás feldolgozás alatt – hamarosan megosztható.</div>';
                    } else {
                        $cta = '<div class="impact-social-ticker__cta impact-social-ticker__cta--info">Csak a saját támogatásodat tudod megosztani — használd ugyanazt az eszközt, amellyel támogattál.</div>';
                    }

                    $ownerBadge = $isOwner ? '<span class="impact-social-ticker__badge">Ez a te támogatásod</span>' : '';
                    $itemClass = 'impact-social-ticker__item impact-social-ticker__item--status-' . sanitize_title($statusRaw);
                    if ($isOwner) {
                        $itemClass .= ' impact-social-ticker__item--owner';
                    }
                    $itemClassAttr = esc_attr($itemClass);

                    $timeIso = esc_attr($item['happened_at'] ?? '');
                    $timeDisplay = esc_html($item['happened_at_display'] ?? ($item['happened_at'] ?? ''));

                    return sprintf(
                        '<li class="%10$s">
                            <div class="impact-social-ticker__headline">%8$s<span class="impact-social-ticker__initials">%1$s</span> támogatta a(z) <strong>%2$s</strong> ügyet %3$s Ft-tal a(z) <strong>%4$s</strong> vásárlással.</div>
                            <div class="impact-social-ticker__meta">
                                <span class="impact-social-ticker__channel">%5$s</span>
                                <time datetime="%6$s">%11$s</time>
                                <span class="impact-social-ticker__status impact-social-ticker__status--%7$s">%7$s</span>
                            </div>
                            %9$s
                        </li>',
                        $initials,
                        $ngo,
                        $amount,
                        $shop,
                        $channel,
                        $timeIso,
                        $status,
                        $ownerBadge,
                        $cta,
                        $itemClassAttr,
                        $timeDisplay
                    );
                },
                $items
            );

            return '<div class="impact-social-ticker ' . esc_attr($layoutClass . ' ' . $themeClass) . '"><ul class="impact-social-ticker__list">' . implode('', $rows) . '</ul></div>';
        }
    }
}

Impact_Social_MVP::bootstrap();
