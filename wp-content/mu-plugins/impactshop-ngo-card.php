<?php
/**
 * Plugin Name: ImpactShop NGO Card API
 * Description: Provides the /wp-json/impact/v1/ngo-card/<slug> endpoint and related helpers for the NGO card embeds.
 * Version:     0.1.0
 * Author:      ImpactShop
 */

if (!defined('ABSPATH')) {
    exit;
}

final class ImpactShop_NGO_Card_Admin
{
    private const PAGE_SLUG = 'impactshop-ngo-card-approval';
    private const NONCE_ACTION = 'impactshop_ngo_card_review';

    public static function bootstrap(): void
    {
        add_action('admin_menu', [__CLASS__, 'register_page']);
        add_action('admin_post_impactshop_ngo_card_approve', [__CLASS__, 'handle_approve']);
        add_action('admin_post_impactshop_ngo_card_reject', [__CLASS__, 'handle_reject']);
    }

    public static function register_page(): void
    {
        add_management_page(
            __('NGO kártya jóváhagyás', 'impactshop'),
            __('NGO kártya', 'impactshop'),
            'manage_options',
            self::PAGE_SLUG,
            [__CLASS__, 'render_page']
        );
    }

    public static function render_page(): void
    {
        if (!current_user_can('manage_options')) {
            wp_die(__('Nincs jogosultság a művelethez.', 'impactshop'));
        }

        $pending  = ImpactShop_NGO_Card_API::get_pending_slug_records();
        $approved = ImpactShop_NGO_Card_API::get_approved_slug_records();
        $nonce    = wp_create_nonce(self::NONCE_ACTION);
        ?>
        <div class="wrap">
            <h1><?php esc_html_e('NGO kártya jóváhagyás', 'impactshop'); ?></h1>
            <?php if (!empty($_GET['updated'])) : ?>
                <div class="notice notice-success is-dismissible">
                    <p><?php esc_html_e('Beállítások frissítve.', 'impactshop'); ?></p>
                </div>
            <?php endif; ?>

            <h2><?php esc_html_e('Jóváhagyásra váró slugok', 'impactshop'); ?></h2>
            <?php if (empty($pending)) : ?>
                <p><?php esc_html_e('Jelenleg nincs jóváhagyásra váró slug.', 'impactshop'); ?></p>
            <?php else : ?>
                <table class="widefat striped">
                    <thead>
                        <tr>
                            <th><?php esc_html_e('Slug', 'impactshop'); ?></th>
                            <th><?php esc_html_e('Megjelenített név', 'impactshop'); ?></th>
                            <th><?php esc_html_e('Első észlelés', 'impactshop'); ?></th>
                            <th><?php esc_html_e('Művelet', 'impactshop'); ?></th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($pending as $slug => $meta) : ?>
                            <tr>
                                <td><code><?php echo esc_html($slug); ?></code></td>
                                <td><?php echo esc_html($meta['name'] ?? ''); ?></td>
                                <td><?php echo esc_html(isset($meta['first_seen']) ? date_i18n('Y-m-d H:i', (int) $meta['first_seen']) : ''); ?></td>
                                <td>
                                    <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" style="display:inline-block;margin-right:8px;">
                                        <input type="hidden" name="action" value="impactshop_ngo_card_approve">
                                        <input type="hidden" name="_wpnonce" value="<?php echo esc_attr($nonce); ?>">
                                        <input type="hidden" name="slug" value="<?php echo esc_attr($slug); ?>">
                                        <input type="hidden" name="name" value="<?php echo esc_attr($meta['name'] ?? ''); ?>">
                                        <button type="submit" class="button button-primary"><?php esc_html_e('Jóváhagyás', 'impactshop'); ?></button>
                                    </form>
                                    <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" style="display:inline-block;">
                                        <input type="hidden" name="action" value="impactshop_ngo_card_reject">
                                        <input type="hidden" name="_wpnonce" value="<?php echo esc_attr($nonce); ?>">
                                        <input type="hidden" name="slug" value="<?php echo esc_attr($slug); ?>">
                                        <button type="submit" class="button"><?php esc_html_e('Elutasítás', 'impactshop'); ?></button>
                                    </form>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            <?php endif; ?>

            <h2 style="margin-top:2.5rem;"><?php esc_html_e('Jóváhagyott slugok', 'impactshop'); ?></h2>
            <?php if (empty($approved)) : ?>
                <p><?php esc_html_e('Nincs jóváhagyott slug.', 'impactshop'); ?></p>
            <?php else : ?>
                <table class="widefat striped">
                    <thead>
                        <tr>
                            <th><?php esc_html_e('Slug', 'impactshop'); ?></th>
                            <th><?php esc_html_e('Megjelenített név', 'impactshop'); ?></th>
                            <th><?php esc_html_e('Jóváhagyva', 'impactshop'); ?></th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($approved as $slug => $meta) : ?>
                            <tr>
                                <td><code><?php echo esc_html($slug); ?></code></td>
                                <td><?php echo esc_html($meta['name'] ?? ''); ?></td>
                                <td><?php echo esc_html(isset($meta['approved_at']) ? date_i18n('Y-m-d H:i', (int) $meta['approved_at']) : ''); ?></td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            <?php endif; ?>
        </div>
        <?php
    }

    public static function handle_approve(): void
    {
        self::require_capability();
        self::verify_nonce();

        $slug = sanitize_text_field($_POST['slug'] ?? '');
        $name = sanitize_text_field($_POST['name'] ?? '');
        if ($slug !== '') {
            ImpactShop_NGO_Card_API::approve_slug($slug, $name);
        }

        wp_safe_redirect(self::page_url(['updated' => 1]));
        exit;
    }

    public static function handle_reject(): void
    {
        self::require_capability();
        self::verify_nonce();

        $slug = sanitize_text_field($_POST['slug'] ?? '');
        if ($slug !== '') {
            ImpactShop_NGO_Card_API::reject_slug($slug);
        }

        wp_safe_redirect(self::page_url(['updated' => 1]));
        exit;
    }

    private static function page_url(array $args = []): string
    {
        return add_query_arg(array_merge(['page' => self::PAGE_SLUG], $args), admin_url('tools.php'));
    }

    private static function require_capability(): void
    {
        if (!current_user_can('manage_options')) {
            wp_die(__('Nincs jogosultság a művelethez.', 'impactshop'));
        }
    }

    private static function verify_nonce(): void
    {
        if (empty($_POST['_wpnonce']) || !wp_verify_nonce($_POST['_wpnonce'], self::NONCE_ACTION)) {
            wp_die(__('Érvénytelen biztonsági token.', 'impactshop'));
        }
    }
}

final class ImpactShop_NGO_Card_API
{
    private const TRANSIENT_KEY = 'impactshop_ngo_card_dataset_v2';
    private const ANNOUNCEMENT_OPTION = 'impactshop_ngo_card_global_announcement';
    private const TOMBOLA_LINK_OPTION = 'impactshop_ngo_card_tombola_links';
    private const VIDEO_LINK_OPTION = 'impactshop_ngo_card_video_links';
    private const ANNOUNCEMENT_MAX_LENGTH = 200;
    private const CACHE_TTL     = 900;   // 15 perc
    private const STALE_TTL     = 3600;  // 60 perc (stale-while-revalidate)
    private const RATE_LIMIT_TTL = 60;   // 60 másodperces ablak
    private const RATE_LIMIT_MAX = 100;  // alap limit / perc / IP
    private const RATE_LIMIT_BURST = 200;
    private const UNIQUE_SLUG_LIMIT_WINDOW = 300; // 5 perc
    private const UNIQUE_SLUG_LIMIT_MAX = 10;     // max 10 különböző slug / 5 perc / IP
    private const FALLBACK_OG_IMAGE = 'https://app.sharity.hu/wp-content/uploads/impactshop/ngo-card-default.jpg';
    private const CARD_REQUEST_TABLE_OPTION = 'impactshop_card_requests_table_ready';
    private const APPROVED_SLUG_OPTION = 'impactshop_ngo_card_approved_slugs';
    private const PENDING_SLUG_OPTION  = 'impactshop_ngo_card_pending_slugs';
    private const FB_APP_ID = '110489627646258';
    private const ASSET_DIR = __DIR__ . '/impactshop-ngo-card-assets';
    private const FONT_REGULAR = 'fonts/Inter-Regular.ttf';
    private const FONT_BOLD = 'fonts/Inter-Bold.ttf';
    private const OG_TEMPLATE = 'og-template.png';
    private const OG_LOGO = 'sharity-logo.png';
    private const BADGE_WINDOW_DAYS = 30;
    private const FRONTEND_SCRIPT_HANDLE = 'impactshop-ngo-card-runtime';
    private const FRONTEND_SCRIPT_VERSION = '20251113g';

    private const VARIANT_FIELDS = [
        'compact' => ['slug', 'name', 'announcement', 'amount.formatted', 'rank', 'badge_status', 'share_url', 'cta_url', 'fillout_url', 'go_url', 'requires_fillout', 'logo_url', 'tombola_url', 'video_support_url'],
        'full'    => ['slug', 'name', 'announcement', 'amount.formatted', 'amount.huf', 'amount.eur', 'amount.eur_formatted', 'rank', 'badge_status', 'next_milestone', 'last_updated', 'share_url', 'cta_url', 'fillout_url', 'go_url', 'requires_fillout', 'logo_url', 'tombola_url', 'video_support_url'],
        'wallet'  => ['slug', 'name', 'announcement', 'amount.huf', 'amount.formatted', 'rank', 'badge_status', 'last_updated', 'cta_url', 'fillout_url', 'go_url', 'requires_fillout', 'share_url', 'logo_url', 'tombola_url', 'video_support_url'],
        'widget'  => ['slug', 'name', 'announcement', 'amount.formatted', 'rank', 'badge_status', 'last_updated', 'share_url', 'cta_url', 'fillout_url', 'go_url', 'requires_fillout', 'logo_url', 'tombola_url', 'video_support_url'],
    ];

    private static $lastCacheStatus = 'MISS';
    private static $badgeApiCache = [];
    private static $rateLimitSnapshot = [
        'ip_hash' => '',
        'count'   => 0,
        'start'   => 0,
        'limited' => false,
    ];

    public static function bootstrap(): void
    {
        add_action('rest_api_init', [__CLASS__, 'register_routes']);
        add_action('impactshop_ngo_card_purge_cache', [__CLASS__, 'purge_cache']);
        add_action('init', [__CLASS__, 'register_share_rewrite']);
        add_action('init', [__CLASS__, 'register_wallet_rewrite']);
        add_filter('query_vars', [__CLASS__, 'register_query_vars']);
        add_action('template_redirect', [__CLASS__, 'handle_templates']);
        add_filter('redirect_canonical', [__CLASS__, 'preserve_wallet_query_args'], 10, 2);
        add_action('init', [__CLASS__, 'maybe_create_request_table'], 5);
        add_action('impactshop_ngo_card_rate_limit_hit', [__CLASS__, 'log_rate_limit_hit'], 10, 2);
        add_action('wp_enqueue_scripts', [__CLASS__, 'enqueue_frontend_assets']);
    }

    public static function register_routes(): void
    {
        register_rest_route(
            'impact/v1',
            '/ngo-card/(?P<slug>[a-z0-9\-]+)/?',
            [
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => [__CLASS__, 'handle_request'],
                'permission_callback' => '__return_true',
                'args'                => [
                    'slug' => [
                        'required'          => true,
                        'sanitize_callback' => 'sanitize_title',
                    ],
                    'fields' => [
                        'required'          => false,
                        'sanitize_callback' => [__CLASS__, 'sanitize_fields'],
                    ],
                    'variant' => [
                        'required'          => false,
                        'sanitize_callback' => [__CLASS__, 'sanitize_variant'],
                    ],
                ],
            ]
        );

        register_rest_route(
            'impact/v1',
            '/ngo-card/(?P<slug>[a-z0-9\-]+)/card-request',
            [
                'methods'             => WP_REST_Server::CREATABLE,
                'callback'            => [__CLASS__, 'handle_card_request'],
                'permission_callback' => '__return_true',
                'args'                => [
                    'slug' => [
                        'required'          => true,
                        'sanitize_callback' => 'sanitize_title',
                    ],
                ],
            ]
        );

        register_rest_route(
            'impact/v1',
            '/ngo/(?P<slug>[a-z0-9\-]+)/badge',
            [
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => [__CLASS__, 'handle_badge_route'],
                'permission_callback' => '__return_true',
                'args'                => [
                    'slug' => [
                        'required'          => true,
                        'sanitize_callback' => 'sanitize_title',
                    ],
                ],
            ]
        );
    }

    public static function enqueue_frontend_assets(): void
    {
        if (wp_doing_ajax()) {
            return;
        }

        wp_enqueue_script(
            self::FRONTEND_SCRIPT_HANDLE,
            self::script_src(),
            [],
            null,
            true
        );
    }

    public static function script_version(): string
    {
        return self::FRONTEND_SCRIPT_VERSION;
    }

    public static function script_src(): string
    {
        $src = trailingslashit(WPMU_PLUGIN_URL) . 'impactshop-ngo-card.js';
        if (self::FRONTEND_SCRIPT_VERSION === '') {
            return $src;
        }

        return add_query_arg('v', rawurlencode(self::FRONTEND_SCRIPT_VERSION), $src);
    }

    public static function handle_request(WP_REST_Request $request)
    {
        $slug = $request->get_param('slug');
        if (!$slug) {
            return new WP_Error('impact_ngo_card_invalid_slug', __('Hiányzó vagy érvénytelen NGO slug.', 'impactshop'), ['status' => 400]);
        }

        if (!self::is_enabled()) {
            return new WP_Error('impact_ngo_card_disabled', __('Az NGO kártya funkció jelenleg inaktív.', 'impactshop'), ['status' => 503]);
        }

        if (self::is_unique_slug_limit_hit($slug)) {
            return new WP_Error('impact_ngo_card_slug_rate_limited', __('Túl sok különböző kártyát kértél rövid időn belül. Kérjük, próbáld újra néhány perc múlva.', 'impactshop'), ['status' => 429]);
        }

        $variant = $request->get_param('variant') ?: 'full';
        $fields  = $request->get_param('fields');
        $fields  = is_array($fields) && $fields ? $fields : null;

        $clientEtag = $request->get_header('if-none-match');

        $rateLimited = self::check_rate_limit();
        $dataset     = self::get_dataset($rateLimited);

        if (!$dataset) {
            return new WP_Error('impact_ngo_card_unavailable', __('Az NGO adatok átmenetileg nem érhetők el.', 'impactshop'), ['status' => 503]);
        }

        $payload = self::build_payload($dataset, $slug, $variant, $fields, $rateLimited);
        if (is_wp_error($payload)) {
            return $payload;
        }

        $etag = $payload['_etag'] ?? '';
        if ($etag && $clientEtag && trim($clientEtag, '"') === $etag) {
            $response = new WP_REST_Response(null, 304);
            $response->header('Cache-Control', self::cache_control_header());
            $response->header('ETag', sprintf('"%s"', $etag));
            $response->header('Last-Modified', self::http_date($payload['_cache']['generated_at']));
            $response->header('X-Cache-Status', self::$lastCacheStatus);
            $response->header('X-Badge-Window-Days', (string) self::BADGE_WINDOW_DAYS);
            return $response;
        }

        $responseData = $payload['data'];
        $response = new WP_REST_Response($responseData, 200);
        $response->header('Cache-Control', self::cache_control_header());
        $response->header('ETag', sprintf('"%s"', $etag));
        $response->header('Last-Modified', self::http_date($payload['_cache']['generated_at']));
        $response->header('X-Cache-Status', self::$lastCacheStatus);
        $response->header('X-Badge-Window-Days', (string) self::BADGE_WINDOW_DAYS);
        if ($rateLimited) {
            $response->header('X-Rate-Limited', 'true');
        }
        if (self::rate_limit_debug_enabled()) {
            $debug = sprintf(
                'hash=%s;count=%d;start=%d;max=%d;burst=%d',
                self::$rateLimitSnapshot['ip_hash'],
                self::$rateLimitSnapshot['count'],
                self::$rateLimitSnapshot['start'],
                self::RATE_LIMIT_MAX,
                self::RATE_LIMIT_BURST
            );
            $response->header('X-Rate-Limit-Debug', $debug);
        }

        return $response;
    }

    public static function get_card_item(string $slug): ?array
    {
        $slug = sanitize_title($slug);
        if ($slug === '') {
            return null;
        }

        $dataset = self::get_dataset(true);
        if (!$dataset || empty($dataset['items'][$slug])) {
            return null;
        }

        return $dataset['items'][$slug];
    }

    public static function get_sample_card_item(): ?array
    {
        $dataset = self::get_dataset(true);
        if (!$dataset || empty($dataset['items'])) {
            return null;
        }

        foreach ($dataset['items'] as $slug => $item) {
            if (!is_array($item)) {
                continue;
            }
            $item['slug'] = $slug;
            return $item;
        }

        return null;
    }

    /**
     * @param bool $allowStale Jelzi, hogy elfogadható-e a lejárt (stale) adat.
     */
    private static function get_dataset(bool $allowStale): ?array
    {
        $cached = get_transient(self::TRANSIENT_KEY);
        $now    = time();

        if (is_array($cached) && isset($cached['generated_at'], $cached['items'])) {
            if (!isset($cached['stale_at'], $cached['expires_at'])) {
                $cached['stale_at']   = $cached['generated_at'] + self::CACHE_TTL;
                $cached['expires_at'] = $cached['generated_at'] + self::CACHE_TTL + self::STALE_TTL;
            }

            if ($now <= (int) $cached['stale_at']) {
                $cached['stale'] = false;
                self::$lastCacheStatus = 'HIT';
                return $cached;
            }

            if ($now <= (int) $cached['expires_at']) {
                if ($allowStale) {
                    $cached['stale'] = true;
                    self::$lastCacheStatus = 'STALE';
                    return $cached;
                }
                // próbáljuk frissíteni
            }
        }

        $fresh = self::rebuild_dataset();
        if ($fresh) {
            self::$lastCacheStatus = 'MISS';
            return $fresh;
        }

        if ($allowStale && is_array($cached)) {
            $cached['stale'] = true;
            self::$lastCacheStatus = 'STALE';
            return $cached;
        }

        return null;
    }

    private static function rebuild_dataset(): ?array
    {
        $rate = impactshop_get_huf_rate();
        if ($rate <= 0) {
            $rate = 392.0;
        }

        $donationRate = self::donation_rate();
        $announcement = self::global_announcement();
        $items        = [];
        $rank         = 1;
        $milestones   = self::milestones();
        $fromDate     = self::leaderboard_start_date();
        $fromDateTime = self::leaderboard_start_datetime();
        $source       = 'totals';
        $rows         = self::collect_totals_rows($fromDate, $rate, $donationRate);

        if (!is_array($rows)) {
            $source = 'ledger';
            $rows   = self::collect_ledger_rows($fromDateTime);
            if (!is_array($rows)) {
                return null;
            }
        }

        if ($source === 'totals') {
            $seedRows = array_map(static function ($row) {
                return [
                    'ngo_slug'    => $row['ngo_slug'] ?? '',
                    'ngo_display' => $row['ngo'] ?? ($row['ngo_label'] ?? ''),
                ];
            }, $rows);
            self::maybe_seed_approved_slugs($seedRows);
        } else {
            self::maybe_seed_approved_slugs($rows);
        }

        foreach ($rows as $row) {
            $slug = sanitize_title($row['ngo_slug'] ?? '');
            if ($slug === '') {
                continue;
            }

            if ($source === 'totals') {
                $nameRaw = $row['ngo'] ?? ($row['ngo_label'] ?? '');
                $amount  = (int) round($row['donation_converted'] ?? 0);
            } else {
                $nameRaw   = $row['ngo_display'] ?? '';
                $rawAmount = (int) ($row['amount_huf'] ?? 0);
                $rawAmount = max(0, $rawAmount);
                $amount    = (int) round($rawAmount * $donationRate);
            }

            if ($amount < 0) {
                $amount = 0;
            }

            $amountEur = round($amount / $rate, 2);
            $amountData = [
                'huf'           => $amount,
                'eur'           => $amountEur,
                'formatted'     => impactshop_format_huf($amount),
                'eur_formatted' => self::format_eur($amountEur),
            ];

            $name = self::resolve_display_name($slug, $nameRaw);

            if (!self::ensure_slug_review_record($slug, $name)) {
                continue;
            }

            if ($source === 'totals') {
                $latestTs = time();
            } else {
                $latest = $row['latest'] ?? null;
                $latestTs = $latest ? strtotime($latest) : false;
                if (!$latestTs) {
                    $latestTs = time();
                }
            }

            $nextMilestone = self::calculate_milestone($amount, $milestones);

            $requiresFillout = self::requires_fillout($slug);
            $filloutEmbed    = $requiresFillout ? self::fillout_url($slug, 'ngo-card-embed') : '';
            $goEmbed         = self::go_url($slug, 'ngo-card-embed');
            $ctaUrl          = self::cta_url($slug, 'ngo-card-embed');

            $items[$slug] = [
                'slug'             => $slug,
                'name'             => $name,
                'announcement'     => $announcement,
                'tombola_url'      => self::tombola_url($slug),
                'video_support_url'=> self::video_support_url($slug),
                'amount'           => $amountData,
                'rank'             => $rank,
                'badge_status'     => self::badge_status_for($slug, $rank, $amount),
                'next_milestone'   => $nextMilestone,
                'last_updated'     => gmdate('c', $latestTs),
                'share_url'        => self::share_url($slug),
                'cta_url'          => $ctaUrl,
                'fillout_url'      => $filloutEmbed,
                'go_url'           => $goEmbed,
                'requires_fillout' => $requiresFillout,
                'og_image'         => self::og_image_url($slug),
                'logo_url'         => self::logo_url($slug),
            ];

            $rank++;
        }

        $generatedAt = time();
        $dataset = [
            'generated_at'     => $generatedAt,
            'stale_at'         => $generatedAt + self::CACHE_TTL,
            'expires_at'       => $generatedAt + self::CACHE_TTL + self::STALE_TTL,
            'items'            => $items,
            'hash'             => sha1(wp_json_encode($items)),
            'stale'            => false,
            'leaderboard_from' => $fromDateTime,
        ];

        set_transient(self::TRANSIENT_KEY, $dataset, self::CACHE_TTL + self::STALE_TTL);

        return $dataset;
    }

    private static function badge_status_for(string $slug, int $rank, int $amount, bool $skipFilters = false): array
    {
        $status = [
            'key'         => 'spark',
            'label'       => __('Boost Mode', 'impactshop'),
            'description' => __('Lendületbe hozod a közösséget – most gyűlnek az első támogatások.', 'impactshop'),
        ];

        if ($rank <= 3) {
            $status = [
                'key'         => 'legend',
                'label'       => __('Legend Mode', 'impactshop'),
                'description' => __('Ikonikus teljesítmény – kiemelkedő mozgósítás.', 'impactshop'),
            ];
        } elseif ($rank <= 10) {
            $status = [
                'key'         => 'momentum',
                'label'       => __('Momentum Mode', 'impactshop'),
                'description' => __('Folyamatos lendület – hétről hétre érkeznek az támogatások.', 'impactshop'),
            ];
        }

        if ($skipFilters) {
            return $status;
        }

        /**
         * Allows external overrides for badge statuses.
         *
         * @param array $status Default status array.
         * @param string $slug NGO slug.
         * @param int $rank Current rank.
         * @param int $amount 30 napos összeg (HUF).
         */
        $status = apply_filters('impactshop_ngo_card_badge_status', $status, $slug, $rank, $amount);

        return is_array($status) ? array_merge(
            [
                'key' => 'spark',
                'label' => __('Boost Mode', 'impactshop'),
                'description' => __('Lendületbe hozod a közösséget – most gyűlnek az első támogatások.', 'impactshop'),
            ],
            $status
        ) : [
            'key' => 'spark',
            'label' => __('Boost Mode', 'impactshop'),
            'description' => __('Lendületbe hozod a közösséget – most gyűlnek az első támogatások.', 'impactshop'),
        ];
    }

    private static function resolve_display_name(string $slug, string $rawName): string
    {
        $name = $rawName ?: '';
        if ($name === '' && function_exists('impactshop_resolve_ngo_name')) {
            $name = impactshop_resolve_ngo_name($slug);
        }
        if ($name === '') {
            $name = ucwords(str_replace('-', ' ', $slug));
        }
        return $name;
    }

    private static function leaderboard_start_datetime(): string
    {
        $date = self::leaderboard_start_date();
        $timestamp = strtotime($date . ' 00:00:00');
        if ($timestamp <= 0) {
            $timestamp = strtotime('2025-10-23 00:00:00');
        }
        return gmdate('Y-m-d', $timestamp) . ' 00:00:00';
    }

    private static function leaderboard_start_date(): string
    {
        $candidates = [];

        if (function_exists('_ims_from_default')) {
            $fromDefault = _ims_from_default();
            if ($fromDefault) {
                $candidates[] = $fromDefault;
            }
        }
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
            if ($timestamp && $timestamp > 0) {
                return gmdate('Y-m-d', $timestamp);
            }
        }

        return '2025-10-23';
    }

    private static function collect_totals_rows(string $fromDate, float $rateHuf, float $donationRate): ?array
    {
        if (!function_exists('impactshop_totals_collect')) {
            return null;
        }

        $to = function_exists('_ims_today') ? _ims_today() : gmdate('Y-m-d');
        $data = impactshop_totals_collect($fromDate, $to, 'all', 'ngo', '', 0, 'HUF', $rateHuf, $donationRate);
        if (is_wp_error($data) || !is_array($data)) {
            return null;
        }

        $rows = $data['rows'] ?? null;
        if (!is_array($rows) || !$rows) {
            return null;
        }

        return $rows;
    }

    private static function collect_ledger_rows(string $fromDateTime): ?array
    {
        global $wpdb;

        $table = $wpdb->prefix . 'impact_ledger';
        $sql   = $wpdb->prepare(
            "
            SELECT ngo_slug,
                   MAX(ngo_display) AS ngo_display,
                   SUM(amount_huf)  AS amount_huf,
                   MAX(happened_at) AS latest
            FROM {$table}
            WHERE ngo_slug <> ''
              AND status IN ('approved','pending')
              AND happened_at >= %s
            GROUP BY ngo_slug
            ORDER BY amount_huf DESC, ngo_slug ASC
        ",
            $fromDateTime
        );

        $rows = $wpdb->get_results($sql, ARRAY_A);
        if (!is_array($rows) || !$rows) {
            return null;
        }

        return $rows;
    }

    private static function donation_rate(): float
    {
        $rate = defined('IMPACT_DONATION_RATE') ? (float) IMPACT_DONATION_RATE : 0.5;
        /**
         * Allows overriding the donation rate used by NGO cards.
         *
         * @param float $rate Current rate (0 - 1).
         */
        $rate = apply_filters('impactshop_ngo_card_donation_rate', $rate);
        if (!is_numeric($rate)) {
            return 0.5;
        }

        $rate = (float) $rate;
        if ($rate < 0) {
            $rate = 0.0;
        } elseif ($rate > 1) {
            $rate = 1.0;
        }

        return $rate;
    }

    private static function logo_url(string $slug): string
    {
        $slug = sanitize_title($slug);
        if ($slug === '') {
            return '';
        }

        $upload = wp_upload_dir();
        if (empty($upload['basedir']) || empty($upload['baseurl'])) {
            return '';
        }

        $extensions = ['png', 'jpg', 'jpeg', 'webp'];
        foreach ($extensions as $ext) {
            $relative = '/impactshop/ngo-logos/' . $slug . '.' . $ext;
            $path     = $upload['basedir'] . $relative;
            if (file_exists($path)) {
                return $upload['baseurl'] . $relative;
            }
        }

        return '';
    }

    private static function maybe_seed_approved_slugs(array $rows): void
    {
        $approved = get_option(self::APPROVED_SLUG_OPTION, null);
        if (is_array($approved)) {
            return;
        }

        $seed = [];
        $now  = time();
        foreach ($rows as $row) {
            $slug = sanitize_title($row['ngo_slug'] ?? '');
            if ($slug === '') {
                continue;
            }
            $seed[$slug] = [
                'name'        => self::resolve_display_name($slug, $row['ngo_display'] ?? ''),
                'approved_at' => $now,
            ];
        }

        update_option(self::APPROVED_SLUG_OPTION, $seed, false);
        update_option(self::PENDING_SLUG_OPTION, [], false);
    }

    private static function ensure_slug_review_record(string $slug, string $name): bool
    {
        $approved = self::approved_slug_records();
        if (isset($approved[$slug])) {
            if ($name !== '' && ($approved[$slug]['name'] ?? '') === '') {
                $approved[$slug]['name'] = $name;
                self::save_approved_slug_records($approved);
            }
            return true;
        }

        $pending = self::pending_slug_records();
        if (!isset($pending[$slug])) {
            $pending[$slug] = [
                'name'       => $name,
                'first_seen' => time(),
            ];
            self::save_pending_slug_records($pending);
        }

        return false;
    }

    public static function override_badge_status_from_api(array $status, string $slug, int $rank, int $amount): array
    {
        if (isset(self::$badgeApiCache[$slug])) {
            return self::$badgeApiCache[$slug];
        }

        $endpoint = rest_url(sprintf('impact/v1/ngo/%s/badge', rawurlencode($slug)));
        $response = wp_remote_get($endpoint, [
            'timeout' => 5,
            'headers' => [
                'Accept' => 'application/json',
                'X-ImpactShop-NgoCard' => '1',
            ],
        ]);

        if (is_wp_error($response)) {
            return $status;
        }

        $code = wp_remote_retrieve_response_code($response);
        if ($code !== 200) {
            return $status;
        }

        $body = wp_remote_retrieve_body($response);
        $data = json_decode($body, true);
        if (!is_array($data) || empty($data['status'])) {
            return $status;
        }

        $key = sanitize_key($data['status']);
        if ($key === '') {
            return $status;
        }

        $mapped = [
            'key'         => $key,
            'label'       => isset($data['label']) ? sanitize_text_field($data['label']) : self::badge_label_from_key($key),
            'description' => isset($data['description']) ? sanitize_text_field($data['description']) : self::badge_description_from_key($key),
        ];

        self::$badgeApiCache[$slug] = $mapped;
        return $mapped;
    }

    public static function handle_badge_route(WP_REST_Request $request)
    {
        $slug = sanitize_title($request->get_param('slug'));
        if ($slug === '') {
            return new WP_Error('impact_ngo_badge_invalid_slug', __('Hiányzó vagy érvénytelen NGO slug.', 'impactshop'), ['status' => 400]);
        }

        $dataset = self::get_dataset(true);
        if (!$dataset || !isset($dataset['items'][$slug])) {
            return new WP_Error('impact_ngo_badge_not_found', __('A kért NGO nem található a jelenlegi listában.', 'impactshop'), ['status' => 404]);
        }

        $item = $dataset['items'][$slug];
        $rank = (int) ($item['rank'] ?? 0);
        $amount = (int) ($item['amount']['huf'] ?? 0);

        $badge = self::badge_status_for($slug, $rank, $amount, true);

        $response = [
            'status'      => $badge['key'],
            'label'       => $badge['label'],
            'description' => $badge['description'],
            'rank'        => $rank,
            'amount'      => $item['amount'] ?? null,
            'updatedAt'   => $item['last_updated'] ?? null,
        ];

        return new WP_REST_Response($response, 200);
    }

    private static function badge_label_from_key(string $key): string
    {
        switch ($key) {
            case 'legend':
                return __('Legend Mode', 'impactshop');
            case 'momentum':
                return __('Momentum Mode', 'impactshop');
            default:
                return __('Boost Mode', 'impactshop');
        }
    }

    private static function badge_description_from_key(string $key): string
    {
        switch ($key) {
            case 'legend':
                return __('Ikonikus teljesítmény – kiemelkedő mozgósítás.', 'impactshop');
            case 'momentum':
                return __('Folyamatos lendület – hétről hétre érkeznek az támogatások.', 'impactshop');
            default:
                return __('Lendületbe hozod a közösséget – most gyűlnek az első támogatások.', 'impactshop');
        }
    }

    private static function build_payload(array $dataset, string $slug, string $variant, ?array $fields, bool $rateLimited)
    {
        if (!isset($dataset['items'][$slug])) {
            return new WP_Error(
                'impact_ngo_card_not_found',
                __('A kért NGO nem található a jelenlegi országos listában.', 'impactshop'),
                ['status' => 404]
            );
        }

        $item = $dataset['items'][$slug];
        $variantFields = self::variant_fields($variant);
        if ($fields) {
            $fields = array_values(array_unique(array_filter(array_map('trim', $fields))));
            $allowed = array_values(array_unique(array_merge($variantFields, $fields)));
        } else {
            $allowed = $variantFields;
        }

        $data = self::filter_fields($item, $allowed);
        $now  = time();
        $age  = max(0, $now - (int) $dataset['generated_at']);

        $cacheMeta = [
            'generated_at' => $dataset['generated_at'],
            'age'          => $age,
            'stale'        => (bool) ($dataset['stale'] || ($now > (int) $dataset['stale_at']) || $rateLimited),
            'expires'      => gmdate('c', (int) $dataset['stale_at']),
            'stale_expires'=> gmdate('c', (int) $dataset['expires_at']),
        ];

        $etagSource = $dataset['hash'] . '|' . $slug . '|' . $variant . '|' . ($fields ? implode(',', $fields) : '');
        $etag = sha1($etagSource);

        $data['_cache'] = $cacheMeta;

        return [
            'data'  => $data,
            '_etag' => $etag,
            '_cache'=> $cacheMeta,
        ];
    }

    public static function handle_card_request(WP_REST_Request $request)
    {
        $slug = sanitize_title($request->get_param('slug'));
        if ($slug === '') {
            return new WP_Error('impact_ngo_card_invalid_slug', __('Hiányzó vagy érvénytelen NGO slug.', 'impactshop'), ['status' => 400]);
        }

        $name    = sanitize_text_field($request->get_param('name') ?? '');
        $email   = sanitize_email($request->get_param('email') ?? '');
        $consent = filter_var($request->get_param('consent'), FILTER_VALIDATE_BOOLEAN);
        $loc     = sanitize_key($request->get_param('loc') ?? '');

        if (!is_email($email)) {
            return new WP_Error('impact_ngo_card_invalid_email', __('Kérjük, valós e-mail címet adj meg.', 'impactshop'), ['status' => 400]);
        }

        $rateKey = 'impact_card_req_' . md5(strtolower($email));
        if (get_transient($rateKey)) {
            return new WP_Error('impact_ngo_card_rate_limited', __('Rövid időn belül már kértél kártyát. Próbáld újra néhány perc múlva.', 'impactshop'), ['status' => 429]);
        }

        $dataset = self::get_dataset(true);
        if (!$dataset || !isset($dataset['items'][$slug])) {
            return new WP_Error('impact_ngo_card_not_found', __('A kért NGO nem található a listában.', 'impactshop'), ['status' => 404]);
        }

        $item = $dataset['items'][$slug];
        [$cardPath, $cardUrl] = self::get_or_generate_card_asset($slug, $item);
        if (!$cardPath || !file_exists($cardPath)) {
            return new WP_Error('impact_ngo_card_missing_asset', __('A kártya sablonja még nem áll rendelkezésre. Kérjük, próbáld újra később.', 'impactshop'), ['status' => 503]);
        }

        $recipientName = $name !== '' ? $name : $item['name'];
        $ctaUrl = self::cta_url($slug, 'ngo-card-share');
        $shareUrl = $item['share_url'] ?? self::share_url($slug);

        $subject = sprintf(__('Impact Shop kártya – %s', 'impactshop'), $item['name']);

        $html = sprintf(
            '
            <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #0f172a;">
              <p>%1$s</p>
              <p>%2$s</p>
              <div style="margin: 16px 0;">
                <a href="%3$s" style="display:inline-block;padding:12px 24px;border-radius:999px;background:linear-gradient(135deg,#38bdf8,#2563eb);color:#021826;font-weight:700;text-decoration:none;">%4$s</a>
              </div>
              <div style="margin:12px 0;">
                <a href="%5$s" style="color:#2563eb;">%6$s</a>
              </div>
              <p style="font-size:0.9rem;color:#475569;">%8$s<br><a href="%9$s">%9$s</a></p>
              <p style="margin-top:24px;font-size:0.85rem;color:#475569;">%7$s</p>
            </div>',
            sprintf(__('Szia %s!', 'impactshop'), esc_html($recipientName ?: __('támogató', 'impactshop'))),
            sprintf(__('Köszönjük, hogy támogatod a(z) %s ügyét az Impact Shopban! A csatolmányban megtalálod a digitális kártyát.', 'impactshop'), esc_html($item['name'])),
            esc_url($ctaUrl),
            esc_html(__('Vásárolj az Impact Shopban', 'impactshop')),
            esc_url($shareUrl),
            esc_html(__('Megosztási oldal megnyitása', 'impactshop')),
            __('Tipp: mentsd le a kártyát a telefonodra, és oszd meg a közösségi médiában a linkkel együtt.', 'impactshop'),
            __('Ha a gombok nem működnek, másold ki a támogatási linket:', 'impactshop'),
            esc_url($ctaUrl)
        );

        $headers = ['Content-Type: text/html; charset=UTF-8'];
        $attachments = [$cardPath];

        $sent = wp_mail($email, $subject, $html, $headers, $attachments);
        if (!$sent) {
            return new WP_Error('impact_ngo_card_mail_failed', __('Nem sikerült elküldeni az e-mailt. Próbáld újra később.', 'impactshop'), ['status' => 500]);
        }

        self::insert_card_request([
            'slug'    => $slug,
            'name'    => $recipientName,
            'email'   => $email,
            'consent' => $consent ? 1 : 0,
            'card_url'=> $cardUrl,
            'card_path'=> $cardPath,
            'context' => $loc,
        ]);

        set_transient($rateKey, 1, MINUTE_IN_SECONDS * 10);

        return rest_ensure_response([
            'success' => true,
            'message' => __('Elküldtük a kártyát e-mailben. Kérjük, ellenőrizd a beérkező levelek mappát (és ha kell, a spam mappát is).', 'impactshop'),
        ]);
    }

    private static function filter_fields(array $item, array $allowed): array
    {
        $grouped = [];
        foreach ($allowed as $field) {
            $field = trim($field);
            if ($field === '') {
                continue;
            }
            if (strpos($field, '.') !== false) {
                [$root, $sub] = explode('.', $field, 2);
                $root = trim($root);
                $sub  = trim($sub);
                if ($root === '' || $sub === '') {
                    continue;
                }
                if (!isset($grouped[$root])) {
                    $grouped[$root] = ['full' => false, 'subs' => []];
                }
                $grouped[$root]['subs'][] = $sub;
            } else {
                if (!isset($grouped[$field])) {
                    $grouped[$field] = ['full' => true, 'subs' => []];
                } else {
                    $grouped[$field]['full'] = true;
                }
            }
        }

        $result = [];
        foreach ($grouped as $root => $info) {
            if (!array_key_exists($root, $item)) {
                continue;
            }

            $value = $item[$root];

            if (!empty($info['full']) || !is_array($value)) {
                $result[$root] = $value;
                continue;
            }

            $subs = array_unique(array_filter($info['subs']));
            if (!$subs) {
                $result[$root] = $value;
                continue;
            }

            $subset = [];
            foreach ($subs as $subKey) {
                if (array_key_exists($subKey, $value)) {
                    $subset[$subKey] = $value[$subKey];
                }
            }
            if ($subset) {
                $result[$root] = $subset;
            }
        }

        return $result;
    }

    private static function check_rate_limit(): bool
    {
        $ip = self::client_ip();
        if ($ip === '') {
            self::$rateLimitSnapshot = [
                'ip_hash' => '',
                'count'   => 0,
                'start'   => time(),
                'limited' => false,
            ];
            return false;
        }

        $key = 'ngo_card_rl_' . md5($ip);
        $data = get_transient($key);
        $now  = time();

        if (!is_array($data) || !isset($data['count'], $data['start'])) {
            $data = ['count' => 0, 'start' => $now];
        }

        if (($now - (int) $data['start']) >= self::RATE_LIMIT_TTL) {
            $data = ['count' => 0, 'start' => $now];
        }

        $data['count']++;
        set_transient($key, $data, self::RATE_LIMIT_TTL);

        $limited = false;
        if ($data['count'] > self::RATE_LIMIT_BURST || $data['count'] > self::RATE_LIMIT_MAX) {
            $limited = true;
            do_action('impactshop_ngo_card_rate_limit_hit', $ip, $data);
        }

        self::$rateLimitSnapshot = [
            'ip_hash' => substr(md5($ip), 0, 10),
            'count'   => (int) $data['count'],
            'start'   => (int) $data['start'],
            'limited' => $limited,
        ];

        return $limited;
    }

    private static function is_unique_slug_limit_hit(string $slug): bool
    {
        $ip = self::client_ip();
        if ($ip === '') {
            return false;
        }

        $key  = 'ngo_card_slug_rl_' . md5($ip);
        $data = get_transient($key);
        $now  = time();

        if (!is_array($data) || !isset($data['start'], $data['slugs']) || ($now - (int) $data['start']) >= self::UNIQUE_SLUG_LIMIT_WINDOW) {
            $data = [
                'start' => $now,
                'slugs' => [],
            ];
        }

        $slug = sanitize_title($slug);
        if ($slug !== '' && !in_array($slug, $data['slugs'], true)) {
            $data['slugs'][] = $slug;
        }

        $limited = count($data['slugs']) > self::UNIQUE_SLUG_LIMIT_MAX;
        set_transient($key, $data, self::UNIQUE_SLUG_LIMIT_WINDOW);

        if ($limited) {
            do_action('impactshop_ngo_card_rate_limit_hit', $ip, $data);
        }

        return $limited;
    }

    private static function approved_slug_records(): array
    {
        $records = get_option(self::APPROVED_SLUG_OPTION, []);
        return is_array($records) ? $records : [];
    }

    private static function pending_slug_records(): array
    {
        $records = get_option(self::PENDING_SLUG_OPTION, []);
        return is_array($records) ? $records : [];
    }

    private static function save_approved_slug_records(array $records): void
    {
        update_option(self::APPROVED_SLUG_OPTION, $records, false);
    }

    private static function save_pending_slug_records(array $records): void
    {
        update_option(self::PENDING_SLUG_OPTION, $records, false);
    }

    public static function get_approved_slug_records(): array
    {
        return self::approved_slug_records();
    }

    public static function get_pending_slug_records(): array
    {
        return self::pending_slug_records();
    }

    public static function approve_slug(string $slug, string $name = ''): bool
    {
        $slug = sanitize_title($slug);
        if ($slug === '') {
            return false;
        }

        $approved = self::approved_slug_records();
        $approved[$slug] = [
            'name'        => $name ?: ($approved[$slug]['name'] ?? ''),
            'approved_at' => time(),
        ];
        self::save_approved_slug_records($approved);

        $pending = self::pending_slug_records();
        if (isset($pending[$slug])) {
            unset($pending[$slug]);
            self::save_pending_slug_records($pending);
        }

        return true;
    }

    public static function reject_slug(string $slug): bool
    {
        $slug = sanitize_title($slug);
        if ($slug === '') {
            return false;
        }
        $pending = self::pending_slug_records();
        if (isset($pending[$slug])) {
            unset($pending[$slug]);
            self::save_pending_slug_records($pending);
            return true;
        }
        return false;
    }

    public static function purge_cache(): void
    {
        delete_transient(self::TRANSIENT_KEY);
    }

    public static function sanitize_fields($value)
    {
        if (is_string($value)) {
            $value = explode(',', $value);
        }
        if (!is_array($value)) {
            return null;
        }

        $sanitized = [];
        foreach ($value as $item) {
            $item = trim((string) $item);
            if ($item !== '') {
                $sanitized[] = strtolower($item);
            }
        }

        return $sanitized ?: null;
    }

    public static function sanitize_variant($value)
    {
        $value = strtolower(trim((string) $value));
        if (!isset(self::VARIANT_FIELDS[$value])) {
            return 'full';
        }
        return $value;
    }

    private static function variant_fields(string $variant): array
    {
        return self::VARIANT_FIELDS[$variant] ?? self::VARIANT_FIELDS['full'];
    }

    private static function milestones(): array
    {
        return [
            10,
            50,
            100,
            500,
            1000,
            5000,
            10000,
            50000,
            100000,
            250000,
            500000,
            1000000,
        ];
    }

    private static function calculate_milestone(int $amount, array $milestones): array
    {
        $next = null;
        foreach ($milestones as $milestone) {
            if ($amount < $milestone) {
                $next = $milestone;
                break;
            }
        }

        if ($next === null) {
            return [
                'value'     => $amount,
                'progress'  => 100,
                'remaining' => 0,
            ];
        }

        $progress = ($next > 0) ? min(100, round(($amount / $next) * 100)) : 0;
        $remaining = max(0, $next - $amount);

        return [
            'value'     => $next,
            'progress'  => $progress,
            'remaining' => $remaining,
        ];
    }

    private static function format_eur(float $value): string
    {
        $formatted = number_format($value, 2, ',', ' ');
        return '€' . $formatted;
    }

    private static function client_ip(): string
    {
        $candidates = [
            'HTTP_CF_CONNECTING_IP',
            'HTTP_X_REAL_IP',
            'HTTP_X_FORWARDED_FOR',
            'REMOTE_ADDR',
        ];

        foreach ($candidates as $key) {
            if (empty($_SERVER[$key])) {
                continue;
            }

            $value = $_SERVER[$key];
            if ($key === 'HTTP_X_FORWARDED_FOR') {
                $parts = explode(',', $value);
                $value = trim($parts[0]);
            }

            if (filter_var($value, FILTER_VALIDATE_IP)) {
                return $value;
            }
        }

        return '';
    }

    private static function rate_limit_debug_enabled(): bool
    {
        if (defined('IMPACT_NGO_CARD_DEBUG_RL') && IMPACT_NGO_CARD_DEBUG_RL) {
            return true;
        }

        $option = get_option('impactshop_ngo_card_debug_rl', '0');
        if (is_bool($option)) {
            return $option;
        }

        $normalized = strtolower((string) $option);
        return in_array($normalized, ['1', 'true', 'on', 'yes'], true);
    }

    public static function log_rate_limit_hit(string $ip, array $data): void
    {
        $shouldLog = false;
        if (defined('IMPACT_NGO_CARD_LOG_RATE_LIMIT') && IMPACT_NGO_CARD_LOG_RATE_LIMIT) {
            $shouldLog = true;
        }
        if (!$shouldLog) {
            $option = get_option('impactshop_ngo_card_log_rl', '0');
            if (is_bool($option)) {
                $shouldLog = $option;
            } else {
                $normalized = strtolower((string) $option);
                $shouldLog = in_array($normalized, ['1', 'true', 'on', 'yes'], true);
            }
        }

        if ($shouldLog) {
            $message = sprintf(
                '[NGO-CARD] Rate limit hit – ip_hash=%s, count=%d, start=%s, max=%d, burst=%d',
                substr(md5($ip), 0, 10),
                (int) ($data['count'] ?? 0),
                date('c', (int) ($data['start'] ?? time())),
                self::RATE_LIMIT_MAX,
                self::RATE_LIMIT_BURST
            );
            error_log($message);
        }
    }

    private static function is_enabled(): bool
    {
        if (defined('IMPACT_NGO_CARD_ENABLED')) {
            return (bool) IMPACT_NGO_CARD_ENABLED;
        }

        $option = get_option('impactshop_ngo_card_enabled', '1');
        if (is_bool($option)) {
            return $option;
        }

        $normalized = strtolower((string) $option);
        return !in_array($normalized, ['0', 'false', 'off', 'no'], true);
    }

    private static function share_url(string $slug): string
    {
        $path = '/ngo/' . $slug . '/share/';
        return home_url($path);
    }

    private static function fillout_required_ngos(): array
    {
        static $cache = null;
        if ($cache !== null) {
            return $cache;
        }

        $list = [];
        if (function_exists('impactshop_settings')) {
            $settings = impactshop_settings();
            if (!empty($settings['fillout_required_ngos']) && is_array($settings['fillout_required_ngos'])) {
                $list = $settings['fillout_required_ngos'];
            }
        }

        $list = apply_filters('impactshop_fillout_required_ngos', $list);
        if (!is_array($list)) {
            $list = [];
        }

        $normalized = array_values(array_unique(array_filter(array_map('sanitize_title', $list))));
        return $cache = $normalized;
    }

    private static function requires_fillout(string $slug): bool
    {
        $slug = sanitize_title($slug);
        if ($slug === '') {
            return false;
        }

        return in_array($slug, self::fillout_required_ngos(), true);
    }

    private static function medium_from_context(string $context): string
    {
        $lower = strtolower($context);
        if (strpos($lower, 'qr') !== false) {
            return 'qr';
        }
        if (strpos($lower, 'wallet') !== false) {
            return 'wallet';
        }
        if (strpos($lower, 'embed') !== false) {
            return 'embed';
        }
        return 'share';
    }

    private static function go_url(string $slug, string $context = 'ngo-card-share'): string
    {
        $campaign = sprintf('%s-%s', $slug, gmdate('Ym'));
        $utmContent = $context === 'ngo-card-share' ? 'ngo-share-landing' : $context;
        $medium = self::medium_from_context($context);

        $params = [
            'd1'           => $slug,
            'src'          => $context,
            'utm_source'   => 'ngo-card',
            'utm_medium'   => $medium,
            'utm_campaign' => $campaign,
            'utm_content'  => $utmContent,
        ];

        return add_query_arg($params, home_url('/go'));
    }

    private static function fillout_url(string $slug, string $context, array $extra = []): string
    {
        if (!self::requires_fillout($slug)) {
            return '';
        }

        if (!function_exists('impactshop_settings')) {
            return '';
        }

        $settings = impactshop_settings();
        $base = isset($settings['fillout_url']) ? (string) $settings['fillout_url'] : '';
        if ($base === '' || strpos($base, 'fillout.com') === false) {
            return '';
        }

        $slug = sanitize_title($slug);
        $campaign = sprintf('%s-%s', $slug, gmdate('Ym'));
        $medium = self::medium_from_context($context);

        $params = array_merge(
            [
                'ngo' => $slug,
                'src' => $context,
                'utm_source'   => 'ngo-card',
                'utm_medium'   => $medium,
                'utm_campaign' => $campaign,
                'utm_content'  => $context,
            ],
            array_filter(
                $extra,
                static function ($value) {
                    return $value !== null && $value !== '';
                }
            )
        );

        return add_query_arg($params, $base);
    }

    private static function reset_url(): string
    {
        $settings = function_exists('impactshop_settings') ? impactshop_settings() : [];
        $url = '';

        if (!empty($settings['ngo_card_reset_url'])) {
            $url = esc_url_raw($settings['ngo_card_reset_url']);
        } elseif (!empty($settings['fillout_url'])) {
            $url = esc_url_raw($settings['fillout_url']);
        }

        $url = apply_filters('impactshop_ngo_card_reset_url', $url, $settings);

        if ($url === '' || !filter_var($url, FILTER_VALIDATE_URL)) {
            $url = home_url('/impactshop/?reset=1');
        }

        return $url;
    }

    public static function get_reset_url(): string
    {
        return self::reset_url();
    }

    private static function shop_landing_url(string $slug, string $context, array $extra = []): string
    {
        $slug = sanitize_title($slug);
        $base = home_url('/impactshop/');
        $campaign = sprintf('%s-%s', $slug, gmdate('Ym'));
        $medium   = self::medium_from_context($context);

        $params = array_merge(
            [
                'd1'           => $slug,
                'ngo'          => $slug,
                'src'          => $context,
                'utm_source'   => 'ngo-card',
                'utm_medium'   => $medium,
                'utm_campaign' => $campaign,
                'utm_content'  => $context,
            ],
            array_filter(
                $extra,
                static function ($value) {
                    return $value !== null && $value !== '';
                }
            )
        );

        return add_query_arg($params, $base);
    }

    private static function cta_url(string $slug, string $context, array $extra = []): string
    {
        $fillout = self::fillout_url($slug, $context, $extra);
        if ($fillout !== '') {
            return $fillout;
        }
        $landing = self::shop_landing_url($slug, $context, $extra);
        if ($landing !== '') {
            return $landing;
        }
        return self::go_url($slug, $context);
    }

    public static function register_share_rewrite(): void
    {
        add_rewrite_rule(
            '^ngo/([a-z0-9\-]+)/share/?$',
            'index.php?impact_ngo_share=1&impact_ngo_slug=$matches[1]',
            'top'
        );
    }

    public static function register_wallet_rewrite(): void
    {
        add_rewrite_rule(
            '^wallet/add/?$',
            'index.php?impact_wallet_add=1',
            'top'
        );

        $bases = [];
        $basePath = trim(parse_url(home_url(), PHP_URL_PATH) ?? '', '/');
        if ($basePath !== '' && $basePath !== 'wallet') {
            $bases[] = $basePath;
        }

        foreach (['impactshop', 'impactshop-staging'] as $maybeBase) {
            if (!in_array($maybeBase, $bases, true) && get_page_by_path($maybeBase)) {
                $bases[] = $maybeBase;
            }
        }

        foreach ($bases as $prefix) {
            $pattern = '^' . preg_quote($prefix, '/') . '/wallet/add/?$';
            add_rewrite_rule($pattern, 'index.php?impact_wallet_add=1', 'top');
        }
    }

    public static function maybe_create_request_table(): void
    {
        if (get_site_option(self::CARD_REQUEST_TABLE_OPTION)) {
            return;
        }

        global $wpdb;
        $table = $wpdb->prefix . 'impactshop_card_requests';
        $charset = $wpdb->get_charset_collate();

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';

        $sql = "CREATE TABLE {$table} (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            slug varchar(191) NOT NULL,
            requester_name varchar(191) NOT NULL DEFAULT '',
            requester_email varchar(191) NOT NULL,
            consent tinyint(1) NOT NULL DEFAULT 0,
            card_url text NOT NULL,
            card_path text NOT NULL,
            context varchar(191) NOT NULL DEFAULT '',
            created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY  (id),
            KEY slug_created (slug(60), created_at)
        ) {$charset};";

        dbDelta($sql);
        update_site_option(self::CARD_REQUEST_TABLE_OPTION, 1);
    }

    public static function register_query_vars(array $vars): array
    {
        $vars[] = 'impact_ngo_share';
        $vars[] = 'impact_ngo_slug';
        $vars[] = 'impact_wallet_add';
        $vars[] = 'ngo';
        $vars[] = 'loc';
        $vars[] = 'qr_loc';
        return $vars;
    }

    public static function current_slug_from_request(): string
    {
        static $resolved = null;

        if ($resolved !== null) {
            return $resolved;
        }

        $candidates = [
            get_query_var('impact_ngo_slug'),
            get_query_var('ngo'),
            get_query_var('d1'),
        ];

        foreach (['impact_ngo_slug', 'ngo', 'd1'] as $param) {
            if (isset($_GET[$param])) {
                $candidates[] = wp_unslash($_GET[$param]);
            }
        }

        foreach ($candidates as $value) {
            if ($value === '' || $value === null) {
                continue;
            }
            $maybe = sanitize_title($value);
            if ($maybe !== '') {
                $resolved = $maybe;
                return $resolved;
            }
        }

        $resolved = '';
        return $resolved;
    }

    public static function handle_templates(): void
    {
        $shareFlag  = get_query_var('impact_ngo_share');
        $walletFlag = get_query_var('impact_wallet_add');

        if ($shareFlag) {
            self::render_share_handler();
        } elseif ($walletFlag) {
            self::render_wallet_handler();
        }
    }

    /**
     * Prevents WordPress canonical redirects from dropping qr_loc/ngo parameters.
     *
     * WordPress strips unknown query vars when normalising URLs which breaks the QR flow.
     * We keep the redirect but re-append the important args; if that fails we cancel the redirect.
     *
     * @param string|false $redirectUrl  The URL WordPress intends to redirect to.
     * @param string       $requestedUrl The originally requested URL.
     * @return string|false
     */
    public static function preserve_wallet_query_args($redirectUrl, $requestedUrl)
    {
        if (is_admin() || !$requestedUrl) {
            return $redirectUrl;
        }

        $requested = (string) $requestedUrl;

        if (stripos($requested, '/wallet/add') === false) {
            return $redirectUrl;
        }

        $requestedParts = wp_parse_url($requested);
        if (!$requestedParts || empty($requestedParts['query'])) {
            return $redirectUrl;
        }

        parse_str($requestedParts['query'], $requestedQuery);
        $keysToKeep = array_flip(['ngo', 'qr_loc', 'loc']);
        $relevant   = array_intersect_key($requestedQuery, $keysToKeep);

        if (!$relevant) {
            return $redirectUrl;
        }

        if (!$redirectUrl) {
            return false;
        }

        $redirectParts = wp_parse_url($redirectUrl);
        if (!$redirectParts) {
            return $redirectUrl;
        }

        $redirectQuery = [];
        if (!empty($redirectParts['query'])) {
            parse_str($redirectParts['query'], $redirectQuery);
        }

        $needsRebuild = false;
        foreach ($relevant as $key => $value) {
            if (!isset($redirectQuery[$key]) || (string) $redirectQuery[$key] !== (string) $value) {
                $redirectQuery[$key] = $value;
                $needsRebuild = true;
            }
        }

        if (!$needsRebuild) {
            return $redirectUrl;
        }

        $scheme = $redirectParts['scheme'] ?? (is_ssl() ? 'https' : 'http');
        $host   = $redirectParts['host'] ?? '';
        if ($host === '') {
            return $redirectUrl;
        }

        $port = !empty($redirectParts['port']) ? ':' . $redirectParts['port'] : '';
        $path = $redirectParts['path'] ?? '';
        $base = $scheme . '://' . $host . $port . $path;

        return $redirectQuery ? add_query_arg($redirectQuery, $base) : $base;
    }

    private static function render_share_handler(): void
    {
        $slug = sanitize_title(get_query_var('impact_ngo_slug'));
        if ($slug === '') {
            self::render_error_page(__('Az adott NGO kártya nem található.', 'impactshop'), 404);
            exit;
        }

        $dataset = self::get_dataset(true);
        if (!$dataset || !isset($dataset['items'][$slug])) {
            self::render_error_page(__('Az adott NGO kártya nem található.', 'impactshop'), 404);
            exit;
        }

        $item = $dataset['items'][$slug];
        self::render_share_template($item);
        exit;
    }

    private static function global_announcement(): array
    {
        $stored = get_option(self::ANNOUNCEMENT_OPTION, []);
        if (!is_array($stored)) {
            $stored = [];
        }

        $textRaw = isset($stored['text']) ? wp_strip_all_tags((string) $stored['text']) : '';
        $truncate = static function (string $input, int $max) {
            if ($max <= 0) {
                return '';
            }
            if (function_exists('mb_substr')) {
                return mb_substr($input, 0, $max);
            }
            return substr($input, 0, $max);
        };
        $textSanitized = trim($truncate($textRaw, self::ANNOUNCEMENT_MAX_LENGTH));

        $urlRaw = isset($stored['url']) ? esc_url_raw((string) $stored['url']) : '';
        $urlSanitized = $urlRaw !== '' ? $urlRaw : '';

        $announcement = [];
        if ($textSanitized !== '') {
            $announcement = [
                'text' => $textSanitized,
                'url'  => $urlSanitized,
            ];
        }

        /**
         * Szűrő a globális Sharity hírek/announcement tartalmára.
         *
         * @param array $announcement { text: string, url: string }
         * @param array $stored       A nyers opció tartalma
         */
        return apply_filters('impactshop_ngo_card_share_announcement', $announcement, $stored);
    }

    private static function slug_link_from_option(string $slug, string $optionName): string
    {
        $links = get_option($optionName, []);
        if (!is_array($links) || empty($links[$slug])) {
            return '';
        }
        $url = esc_url_raw((string) $links[$slug]);
        return $url ?: '';
    }

    private static function tombola_url(string $slug): string
    {
        /**
         * Lehetővé teszi a Win4Good / tombola CTA URL felülbírálását.
         *
         * @param string $url
         * @param string $slug
         */
        $url = self::slug_link_from_option($slug, self::TOMBOLA_LINK_OPTION);
        return (string) apply_filters('impactshop_ngo_card_tombola_url', $url, $slug);
    }

    private static function video_support_url(string $slug): string
    {
        /**
         * Felülírható a "Támogatom videónézéssel" CTA URL.
         *
         * @param string $url
         * @param string $slug
         */
        $url = self::slug_link_from_option($slug, self::VIDEO_LINK_OPTION);
        return (string) apply_filters('impactshop_ngo_card_video_url', $url, $slug);
    }

    private static function render_share_template(array $item): void
    {
        $slug = $item['slug'];
        $amountFormatted = $item['amount']['formatted'] ?? '';
        $rank = (int) ($item['rank'] ?? 0);
        $name = $item['name'] ?? $slug;
        $shareUrl = self::share_url($slug);
        $ctaUrl   = self::cta_url($slug, 'ngo-card-share');
        $scriptSrc = self::script_src();
        $shareTitle = sprintf(__('Támogasd %s ügyét az Impact Shopban', 'impactshop'), $name);
        $shareText  = wp_strip_all_tags($description);
        $shareData  = [
            'title' => $shareTitle,
            'text'  => $shareText,
            'url'   => $shareUrl,
        ];
        $shareMessage = sprintf(
            __('Segítek a(z) %1$s ügyén: csatlakozz te is az Impact Shopban! %2$s', 'impactshop'),
            $name,
            $shareUrl
        );

        $title = sprintf('%s — %s összegyűjtve', $name, $amountFormatted);
        $description = sprintf(
            'A(z) %s jelenleg #%d a Sharity toplistán, eddig %s támogatás gyűlt össze. Támogasd te is az Impact Shopban!',
            $name,
            $rank,
            $amountFormatted
        );
        $image = $item['og_image'] ?? self::FALLBACK_OG_IMAGE;
        $badgeLabel = $item['badge_status']['label'] ?? '';
        $badgeKey   = $item['badge_status']['key'] ?? '';
        $qrImage = sprintf('https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=%s', rawurlencode($ctaUrl));
        $shareIcons = [
            'facebook' => '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M22 12a10 10 0 1 0-11.6 9.87v-6.99H8.1v-2.9h2.3V9.83c0-2.27 1.36-3.57 3.44-3.57.99 0 2.02.17 2.02.17v2.26h-1.14c-1.12 0-1.47.7-1.47 1.42v1.71h2.51l-.4 2.9h-2.11v6.99A10 10 0 0 0 22 12Z"/></svg>',
            'linkedin' => '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.43h3.96V21H3V9.43Zm6.54 0h3.8v1.59h.05c.53-1 1.83-2.04 3.77-2.04 4.03 0 4.77 2.65 4.77 6.1V21h-3.95v-5.37c0-1.28-.02-2.93-1.79-2.93-1.8 0-2.08 1.4-2.08 2.83V21H9.54V9.43Z"/></svg>',
            'x' => '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="m4 4 6.58 7.78L4.4 20h3.66l4.07-4.92L16 20h4l-6.73-7.95L20 4h-3.66l-3.72 4.68L9 4H4Z"/></svg>',
            'whatsapp' => '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M2 22l1.16-4.24A9.79 9.79 0 0 1 2.2 13c.21-5.39 4.66-9.68 10.05-9.63 5.27.05 9.7 4.34 9.75 9.61.05 5.55-4.47 10.05-10 10.05-1.7 0-3.35-.43-4.81-1.25L2 22Zm6-2.9c1.39.83 3 .9 3.7.9 4.19 0 7.62-3.42 7.6-7.64-.02-4.04-3.32-7.34-7.37-7.36-4.22-.02-7.65 3.38-7.65 7.6 0 1.38.38 2.51.86 3.56l-.67 2.44 2.53-.5Zm-2.1.05Z"/><path fill="currentColor" d="M16.21 13.77c-.2-.1-1.17-.58-1.35-.65-.18-.07-.32-.1-.46.1-.14.2-.53.65-.65.78-.12.13-.24.15-.44.05-.2-.1-.86-.32-1.63-1.01-.6-.53-1-1.19-1.12-1.39-.12-.2-.01-.31.09-.41.1-.1.2-.23.3-.35.1-.12.13-.2.2-.34.07-.14.04-.26-.02-.36-.06-.1-.46-1.12-.63-1.54-.17-.41-.34-.35-.46-.36h-.4c-.14 0-.36.05-.55.26-.18.2-.72.71-.72 1.72 0 1 .74 1.96.85 2.1.12.14 1.45 2.22 3.5 3.12 2.05.9 2.05.6 2.42.57.37-.03 1.2-.49 1.37-.96.17-.47.17-.88.12-.96-.05-.08-.18-.13-.38-.23Z"/></svg>',
            'telegram' => '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="m21.82 4.28-2.52 15.11c-.19 1.1-.9 1.37-1.82.85l-5-3.69-2.41 2.32c-.27.27-.5.5-1.02.5l.37-5.08 9.2-8.31c.4-.36-.09-.56-.62-.2l-11.36 7.16-4.89-1.52c-1.06-.33-1.08-1.06.22-1.57L20.2 2.63c.86-.33 1.62.2 1.62 1.65Z"/></svg>',
            'tiktok' => '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M21 8.17c-1.6 0-3.2-.51-4.45-1.58v6.43a6.43 6.43 0 1 1-5.5-6.36v3.24c-.32-.1-.66-.16-1.01-.16a2.83 2.83 0 0 0 0 5.65c1.22 0 2.24-.8 2.62-1.9.07-.2.11-.42.11-.64V2h3.57c.08.67.35 1.3.77 1.82 1 1.2 2.5 2 4.2 2.08v3.27Z"/></svg>',
        ];

        $shareLinks = [
            'facebook' => [
                'label' => 'Facebook',
                'url'   => sprintf('https://www.facebook.com/sharer/sharer.php?u=%s', rawurlencode($shareUrl)),
            ],
            'linkedin' => [
                'label' => 'LinkedIn',
                'url'   => sprintf(
                    'https://www.linkedin.com/sharing/share-offsite/?%s',
                    http_build_query([
                        'url'     => $shareUrl,
                        'title'   => $title,
                        'summary' => $description,
                    ])
                ),
            ],
            'x' => [
                'label' => 'X',
                'url'   => sprintf(
                    'https://twitter.com/intent/tweet?%s',
                    http_build_query([
                        'text' => $title,
                        'url'  => $shareUrl,
                    ])
                ),
            ],
            'whatsapp' => [
                'label' => 'WhatsApp',
                'url'   => sprintf('https://api.whatsapp.com/send?text=%s', rawurlencode($description . ' ' . $shareUrl)),
            ],
            'telegram' => [
                'label' => 'Telegram',
                'url'   => sprintf(
                    'https://t.me/share/url?%s',
                    http_build_query([
                        'url'  => $shareUrl,
                        'text' => $description,
                    ])
                ),
            ],
            'tiktok' => [
                'label' => 'TikTok',
                'url'   => 'https://www.tiktok.com/upload?lang=hu-HU',
            ],
        ];
        foreach ($shareLinks as $network => &$config) {
            $config['icon'] = $shareIcons[$network] ?? '';
        }
        unset($config);

        $embedSnippet = sprintf(
            '<div data-ngo-card data-ngo="%1$s" data-variant="full"></div>' . "\n" .
            '<script async src="%2$s"></script>',
            $slug,
            esc_url_raw($scriptSrc)
        );

        nocache_headers();

        ?>
<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="utf-8">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?php echo esc_html($title); ?></title>
  <meta name="description" content="<?php echo esc_attr($description); ?>">
  <link rel="canonical" href="<?php echo esc_url($shareUrl); ?>">

  <meta property="og:type" content="website">
  <meta property="og:title" content="<?php echo esc_attr($title); ?>">
  <meta property="og:description" content="<?php echo esc_attr($description); ?>">
  <meta property="og:url" content="<?php echo esc_url($shareUrl); ?>">
  <meta property="og:image" content="<?php echo esc_url($image); ?>">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="fb:app_id" content="<?php echo esc_attr(self::FB_APP_ID); ?>">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="<?php echo esc_attr($title); ?>">
  <meta name="twitter:description" content="<?php echo esc_attr($description); ?>">
  <meta name="twitter:image" content="<?php echo esc_url($image); ?>">

  <style>
    body {
      margin: 0;
      font-family: "Inter", "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      background: radial-gradient(900px 400px at 0% -20%, rgba(14,116,144,0.12), transparent), #0f172a;
      color: #0f172a;
      min-height: 100vh;
      display: grid;
      place-items: center;
      text-align: center;
      padding: 2rem 1rem;
    }
    .impact-ngo-share {
      padding: 2.7rem 2.2rem;
      border-radius: 26px;
      background: linear-gradient(135deg, rgba(15,23,42,0.92), rgba(30,41,59,0.68));
      box-shadow: 0 30px 80px rgba(3,10,27,0.55);
      max-width: 520px;
      width: 100%;
      color: rgba(248,250,252,0.95);
    }
    .impact-ngo-share h1 {
      margin: 0 0 0.75rem;
      font-size: 1.85rem;
      font-weight: 700;
      color: #f8fafc;
    }
    .impact-ngo-share p {
      margin: 0.5rem 0 0;
      color: rgba(226,232,240,0.92);
      line-height: 1.4;
    }
    .impact-ngo-share__amount {
      font-size: 1.4rem;
      color: #e0f2fe;
    }
    .impact-ngo-share__cta {
      display: inline-block;
      margin-top: 1.5rem;
      padding: 0.75rem 1.5rem;
      border-radius: 999px;
      background: linear-gradient(135deg, #7de2ff, #3b82f6 70%);
      color: #041b2d;
      text-decoration: none;
      font-weight: 600;
      box-shadow: 0 18px 38px rgba(59,130,246,0.35);
    }
    .impact-ngo-share__cta:focus-visible {
      outline: 3px solid #1d4ed8;
      outline-offset: 4px;
    }
    .impact-ngo-share__badge {
      display:inline-flex;
      align-items:center;
      gap:0.4rem;
      padding:0.35rem 0.9rem;
      border-radius:999px;
      background: rgba(255,255,255,0.12);
      color:#f0f9ff;
      font-weight:700;
      font-size:0.78rem;
      letter-spacing:0.08em;
      text-transform:uppercase;
      border:1px solid rgba(255,255,255,0.18);
      margin-bottom:0.85rem;
    }
    .impact-ngo-share__badge[data-mode="legend"] {
      background: linear-gradient(135deg, #facc15, #f97316);
      color:#0f172a;
      border-color: transparent;
    }
    .impact-ngo-share__badge[data-mode="momentum"] {
      background: linear-gradient(135deg, #34d399, #10b981);
      color:#022c22;
      border-color: transparent;
    }
    .impact-ngo-share__actions {
      margin-top: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .impact-ngo-share__share-btn,
    .impact-ngo-share__copy-btn,
    .impact-ngo-share__pdf-btn {
      border: none;
      border-radius: 12px;
      padding: 0.65rem 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: transform .15s ease, box-shadow .15s ease;
    }
    .impact-ngo-share__share-btn {
      background: #0ea5e9;
      color: #041b2d;
      box-shadow: 0 10px 24px rgba(14,165,233,.35);
    }
    .impact-ngo-share__copy-btn,
    .impact-ngo-share__pdf-btn {
      background: rgba(148,163,184,0.18);
      color: #e2e8f0;
      border: 1px solid rgba(226,232,240,0.25);
      box-shadow: 0 14px 28px rgba(15,23,42,0.45);
      backdrop-filter: blur(12px);
    }
    .impact-ngo-share__share-btn:hover,
    .impact-ngo-share__copy-btn:hover,
    .impact-ngo-share__pdf-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 12px 26px rgba(15,23,42,.2);
    }
    .impact-ngo-share__copy-btn:hover,
    .impact-ngo-share__pdf-btn:hover {
      background: rgba(148,163,184,0.28);
    }
    .impact-ngo-share__pdf-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
    }
    .impact-ngo-share__grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(64px, 1fr));
      gap: 0.65rem;
      margin-top: 0.5rem;
    }
    .impact-ngo-share__network {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0.75rem;
      border-radius: 16px;
      border: 1px solid rgba(255,255,255,0.18);
      background: rgba(15,23,42,0.45);
      text-decoration: none;
      color: #f8fafc;
      font-weight: 600;
      transition: background .15s ease, transform .2s ease, box-shadow .2s ease;
      box-shadow: inset 0 0 0 1px rgba(148,163,184,0.15), 0 8px 18px rgba(2,6,23,0.45);
      min-height: 56px;
    }
    .impact-ngo-share__network:hover {
      background: rgba(15,23,42,0.65);
      transform: translateY(-1px);
      box-shadow: inset 0 0 0 1px rgba(148,163,184,0.25), 0 12px 28px rgba(2,6,23,0.55);
    }
    .impact-ngo-share__network svg {
      width: 22px;
      height: 22px;
      color: currentColor;
    }
    .impact-ngo-share__network-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .impact-ngo-share__sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      border: 0;
    }
    .impact-ngo-share__card-wrapper .impact-ngo-card__secondary {
      display: none !important;
    }
    .impact-ngo-share__embed {
      margin-top: 2.25rem;
      padding: 1.5rem;
      border-radius: 24px;
      border: 1px solid rgba(148,163,184,0.25);
      background: rgba(15,23,42,0.4);
      box-shadow: 0 18px 38px rgba(2,6,23,0.55);
      backdrop-filter: blur(18px);
    }
    .impact-ngo-share__embed h2 {
      margin: 0 0 0.35rem;
      font-size: 1.2rem;
      color: #f8fafc;
    }
    .impact-ngo-share__embed p {
      margin: 0 0 1rem;
      color: rgba(226,232,240,0.85);
      font-size: 0.95rem;
    }
    .impact-ngo-share__embed-controls {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
      margin-bottom: 0.75rem;
    }
    .impact-ngo-share__embed-copy {
      border: none;
      border-radius: 999px;
      padding: 0.55rem 1.35rem;
      font-weight: 600;
      background: rgba(56,189,248,0.18);
      color: #e0f2fe;
      cursor: pointer;
      box-shadow: 0 10px 18px rgba(14,165,233,0.25);
      transition: transform .15s ease, box-shadow .15s ease;
    }
    .impact-ngo-share__embed-copy:hover {
      transform: translateY(-1px);
      box-shadow: 0 12px 24px rgba(14,165,233,0.35);
    }
    .impact-ngo-share__embed-code {
      width: 100%;
      min-height: 120px;
      border-radius: 18px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(2,6,23,0.7);
      color: #e2e8f0;
      font-family: "JetBrains Mono", "Space Grotesk", monospace;
      font-size: 0.9rem;
      padding: 1rem;
      resize: vertical;
    }
    .impact-ngo-share__message {
      margin-top: 1.5rem;
      padding: 1rem;
      border-radius: 18px;
      background: rgba(15,23,42,0.35);
      border: 1px solid rgba(248,250,252,0.1);
      color: rgba(226,232,240,0.95);
      font-size: 0.92rem;
      line-height: 1.45;
    }
    .impact-ngo-share__message button {
      margin-top: 0.75rem;
      border: none;
      border-radius: 10px;
      padding: 0.55rem 0.95rem;
      font-weight: 600;
      background: rgba(56,189,248,0.18);
      color: #e0f2fe;
      cursor: pointer;
      transition: background .15s ease;
    }
    .impact-ngo-share__message button:hover {
      background: rgba(56,189,248,0.3);
    }
    @media (prefers-reduced-motion: reduce) {
      .impact-ngo-share,
      body {
        background: #0f172a;
      }
    }
  </style>
</head>
<body>
  <main class="impact-ngo-share" role="main" aria-labelledby="ngo-share-title">
    <?php if ($badgeLabel) : ?>
      <div class="impact-ngo-share__badge" data-mode="<?php echo esc_attr($badgeKey); ?>">
        <?php echo esc_html($badgeLabel); ?>
      </div>
    <?php endif; ?>
    <h1 id="ngo-share-title"><?php echo esc_html($name); ?></h1>
    <p aria-live="polite"><?php echo esc_html($description); ?></p>
    <p class="impact-ngo-share__amount" aria-label="Összegyűjtött támogatás">
      <strong><?php echo esc_html($amountFormatted); ?></strong>
    </p>
    <a class="impact-ngo-share__cta" href="<?php echo esc_url($ctaUrl); ?>" aria-label="Tovább az Impact Shopba – <?php echo esc_attr($name); ?>">
      Tovább az Impact Shopba
    </a>
    <div class="impact-ngo-share__actions">
      <button type="button" class="impact-ngo-share__share-btn" id="impact-ngo-share-trigger">
        <?php esc_html_e('Megosztás natív menüben', 'impactshop'); ?>
      </button>
      <div class="impact-ngo-share__grid" role="list">
        <?php foreach ($shareLinks as $network => $config) :
            $label = $config['label'] ?? ucfirst($network);
            $url   = $config['url'] ?? '';
            $icon  = $config['icon'] ?? '';
            if (!$url) {
                continue;
            }
        ?>
          <a
            role="listitem"
            class="impact-ngo-share__network"
            target="_blank"
            rel="noopener"
            href="<?php echo esc_url($url); ?>"
            data-network="<?php echo esc_attr($network); ?>"
            data-label="<?php echo esc_attr($label); ?>"
            aria-label="<?php
            /* translators: %s social network name. */
            echo esc_attr(sprintf(__('Megosztás itt: %s', 'impactshop'), $label));
            ?>"
          >
            <?php if ($icon) : ?>
              <span class="impact-ngo-share__network-icon" aria-hidden="true">
                <?php
                // Ikon HTML biztonságos, kézzel definiált SVG string.
                // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
                echo $icon;
                ?>
              </span>
            <?php else : ?>
              <span class="impact-ngo-share__network-text"><?php echo esc_html($label); ?></span>
            <?php endif; ?>
            <span class="impact-ngo-share__sr-only"><?php echo esc_html($label); ?></span>
          </a>
        <?php endforeach; ?>
      </div>
      <button type="button" class="impact-ngo-share__copy-btn" id="impact-ngo-share-copy">
        <?php esc_html_e('Link másolása', 'impactshop'); ?>
      </button>
      <button type="button" class="impact-ngo-share__pdf-btn" id="impact-ngo-share-pdf">
        <?php esc_html_e('Kártya letöltése (PDF)', 'impactshop'); ?>
      </button>
    </div>
    <div style="margin-top:2rem;">
      <div class="impact-ngo-share__card-wrapper">
        <div
          data-ngo-card
          data-ngo="<?php echo esc_attr($slug); ?>"
          data-variant="full"
          data-qr="<?php echo esc_url($qrImage); ?>"
          data-hide-announcement="true"
          data-hide-app-download="true"
        ></div>
      </div>
    </div>
    <section class="impact-ngo-share__embed" aria-labelledby="impact-ngo-embed-title">
      <div class="impact-ngo-share__embed-controls">
        <h2 id="impact-ngo-embed-title"><?php esc_html_e('Illeszd be a saját weboldaladba', 'impactshop'); ?></h2>
        <button type="button" class="impact-ngo-share__embed-copy" id="impact-ngo-share-embed-copy">
          <?php esc_html_e('Kód másolása', 'impactshop'); ?>
        </button>
      </div>
      <p><?php esc_html_e('Másold ki a kódot, illeszd be a kívánt oldal HTML blokkjába – a kártya automatikusan frissül és a CTA az Impact Shopra mutat.', 'impactshop'); ?></p>
      <textarea
        id="impact-ngo-share-embed-code"
        class="impact-ngo-share__embed-code"
        rows="4"
        readonly
        spellcheck="false"
      ><?php echo esc_textarea($embedSnippet); ?></textarea>
    </section>
    <div class="impact-ngo-share__message">
      <div><?php esc_html_e('Készült megosztási üzenet:', 'impactshop'); ?></div>
      <p id="impact-ngo-share-text"><?php echo esc_html($shareMessage); ?></p>
      <button type="button" id="impact-ngo-share-copy-text"><?php esc_html_e('Üzenet másolása', 'impactshop'); ?></button>
    </div>
  </main>
  <script>
  (function() {
    const shareData = <?php echo wp_json_encode($shareData); ?>;
    const shareUrl = <?php echo wp_json_encode($shareUrl); ?>;
    const shareMessage = <?php echo wp_json_encode($shareMessage); ?>;
    const ctaUrl = <?php echo wp_json_encode($ctaUrl); ?>;
    const cardSlug = <?php echo wp_json_encode($slug); ?>;
    const copyLabels = {
      linkCopied: "<?php echo esc_js(__('Kimásolva ✓', 'impactshop')); ?>",
      linkDefault: "<?php echo esc_js(__('Link másolása', 'impactshop')); ?>",
      messageCopied: "<?php echo esc_js(__('Üzenet másolva ✓', 'impactshop')); ?>",
      messageDefault: "<?php echo esc_js(__('Üzenet másolása', 'impactshop')); ?>",
      tiktokCopied: "<?php echo esc_js(__('TikTok szöveg kimásolva ✓', 'impactshop')); ?>",
      embedCopied: "<?php echo esc_js(__('Beillesztési kód másolva ✓', 'impactshop')); ?>",
      embedDefault: "<?php echo esc_js(__('Kód másolása', 'impactshop')); ?>",
    };
    const pdfLabels = {
      default: "<?php echo esc_js(__('Kártya letöltése (PDF)', 'impactshop')); ?>",
      generating: "<?php echo esc_js(__('PDF készítése…', 'impactshop')); ?>",
      error: "<?php echo esc_js(__('Nem sikerült a PDF mentése', 'impactshop')); ?>",
    };

    function openNativeShare() {
      if (!navigator.share) {
        return Promise.reject();
      }
      return navigator.share(shareData);
    }

    function copyValue(value) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(value);
      }
      return new Promise((resolve, reject) => {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand('copy') ? resolve() : reject();
        } catch (err) {
          reject(err);
        }
        document.body.removeChild(ta);
      });
    }

    function flashLabel(el, successText, fallbackText) {
      if (!el) {
        return;
      }
      const base = fallbackText || el.getAttribute('data-label') || el.textContent;
      el.dataset.flashOriginalHtml = el.innerHTML;
      el.textContent = successText;
      setTimeout(() => {
        if (fallbackText) {
          el.textContent = base;
        } else if (Object.prototype.hasOwnProperty.call(el.dataset, 'flashOriginalHtml')) {
          el.innerHTML = el.dataset.flashOriginalHtml;
        } else {
          el.textContent = base;
        }
        delete el.dataset.flashOriginalHtml;
      }, 2000);
    }

    function copyLink(btn) {
      copyValue(shareUrl)
        .then(() => flashLabel(btn, copyLabels.linkCopied, copyLabels.linkDefault))
        .catch(() => flashLabel(btn, copyLabels.linkCopied, copyLabels.linkDefault));
    }

    function copyCustomText(btn) {
      copyValue(shareMessage)
        .then(() => flashLabel(btn, copyLabels.messageCopied, copyLabels.messageDefault))
        .catch(() => flashLabel(btn, copyLabels.messageCopied, copyLabels.messageDefault));
    }

    function bindEmbedCopyButton() {
      const embedTextarea = document.getElementById('impact-ngo-share-embed-code');
      const embedBtn = document.getElementById('impact-ngo-share-embed-copy');
      if (!embedTextarea || !embedBtn) {
        return;
      }
      embedBtn.addEventListener('click', function(e) {
        e.preventDefault();
        copyValue(embedTextarea.value)
          .then(() => flashLabel(embedBtn, copyLabels.embedCopied, copyLabels.embedDefault))
          .catch(() => flashLabel(embedBtn, copyLabels.embedCopied, copyLabels.embedDefault));
      });
    }

    function bindTikTokShare() {
      const tiktokLinks = document.querySelectorAll('.impact-ngo-share__network[data-network="tiktok"]');
      if (!tiktokLinks.length) {
        return;
      }
      tiktokLinks.forEach((link) => {
        link.addEventListener('click', function() {
          copyValue(shareMessage)
            .then(() => flashLabel(link, copyLabels.tiktokCopied))
            .catch(() => flashLabel(link, copyLabels.tiktokCopied));
        });
      });
    }

    function loadScript(src) {
      return new Promise((resolve, reject) => {
        const existing = document.querySelector('script[src="' + src + '"]');
        if (existing) {
          if (existing.dataset.loaded === 'true') {
            resolve();
            return;
          }
          existing.addEventListener('load', () => resolve());
          existing.addEventListener('error', () => reject(new Error('Failed to load ' + src)));
          return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.defer = true;
        script.onload = () => {
          script.dataset.loaded = 'true';
          resolve();
        };
        script.onerror = () => reject(new Error('Failed to load ' + src));
        document.head.appendChild(script);
      });
    }

    async function ensurePdfLibs() {
      if (window.html2canvas && window.jspdf && window.jspdf.jsPDF) {
        return;
      }
      await loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');
      await loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');
    }

    async function generatePdf() {
      const card = document.querySelector('.impact-ngo-share__card-wrapper .impact-ngo-card');
      if (!card) {
        throw new Error('missing-card');
      }
      await ensurePdfLibs();
      const canvas = await window.html2canvas(card, {
        backgroundColor: null,
        scale: window.devicePixelRatio > 1 ? 2 : 1.5,
        useCORS: true,
        allowTaint: false,
      });
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('p', 'pt', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const ratio = Math.min(pageWidth / canvas.width, (pageHeight - 80) / canvas.height);
      const imgWidth = canvas.width * ratio;
      const imgHeight = canvas.height * ratio;
      const x = (pageWidth - imgWidth) / 2;
      const y = 40;
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', x, y, imgWidth, imgHeight, '', 'FAST');
      if (ctaUrl) {
        const linkLabel = "<?php echo esc_js(__('Támogasd most online', 'impactshop')); ?>";
        pdf.setFontSize(12);
        pdf.setTextColor(44, 118, 255);
        const textWidth = pdf.getTextWidth(linkLabel);
        const linkX = (pageWidth - textWidth) / 2;
        const linkY = y + imgHeight + 30;
        pdf.textWithLink(linkLabel, linkX, linkY, { url: ctaUrl });
      }
      const filename = (cardSlug ? `${cardSlug}-impactshop-kartya` : 'impactshop-ngo-card') + '.pdf';
      pdf.save(filename);
    }

    function bindPdfButton() {
      const btn = document.getElementById('impact-ngo-share-pdf');
      if (!btn) {
        return;
      }
      const originalLabel = pdfLabels.default;
      btn.addEventListener('click', async function(e) {
        e.preventDefault();
        if (btn.dataset.loading === 'true') {
          return;
        }
        btn.dataset.loading = 'true';
        try {
          btn.textContent = pdfLabels.generating;
          await generatePdf();
          btn.textContent = originalLabel;
        } catch (err) {
          console.error('PDF export failed', err);
          flashLabel(btn, pdfLabels.error, originalLabel);
          return;
        } finally {
          btn.dataset.loading = 'false';
        }
      });
    }

    document.addEventListener('DOMContentLoaded', function() {
      openNativeShare().catch(() => {});

      const trigger = document.getElementById('impact-ngo-share-trigger');
      if (trigger) {
        trigger.addEventListener('click', function(e) {
          e.preventDefault();
          openNativeShare().catch(() => {});
        });
      }

      const copyBtn = document.getElementById('impact-ngo-share-copy');
      if (copyBtn) {
        copyBtn.addEventListener('click', function(e) {
          e.preventDefault();
          copyLink(copyBtn);
        });
      }

      const copyTextBtn = document.getElementById('impact-ngo-share-copy-text');
      if (copyTextBtn) {
        copyTextBtn.addEventListener('click', function(e) {
          e.preventDefault();
          copyCustomText(copyTextBtn);
        });
      }

      bindEmbedCopyButton();
      bindTikTokShare();
      bindPdfButton();
    });
  })();
  </script>
  <script
    id="impactshop-ngo-card-runtime-share"
    src="<?php echo esc_url($scriptSrc); ?>"
    defer
  ></script>
</body>
</html>
        <?php
        exit;
    }

    private static function render_wallet_handler(): void
    {
        $slugRaw = get_query_var('ngo');
        if (($slugRaw === '' || $slugRaw === null) && isset($_GET['ngo'])) {
            $slugRaw = wp_unslash($_GET['ngo']);
        }
        $slug = sanitize_title($slugRaw);

        $locRaw = get_query_var('qr_loc');
        if (($locRaw === '' || $locRaw === null) && isset($_GET['qr_loc'])) {
            $locRaw = wp_unslash($_GET['qr_loc']);
        }
        if (($locRaw === '' || $locRaw === null) && isset($_GET['loc'])) {
            $locRaw = wp_unslash($_GET['loc']);
        }
        if ($locRaw === '' || $locRaw === null) {
            $query = $_SERVER['QUERY_STRING'] ?? '';
            if ($query !== '') {
                parse_str($query, $parsed);
                if (!empty($parsed['qr_loc'])) {
                    $locRaw = $parsed['qr_loc'];
                } elseif (!empty($parsed['loc'])) {
                    $locRaw = $parsed['loc'];
                }
            }
        }
        $loc  = ($locRaw !== '' && $locRaw !== null) ? sanitize_key($locRaw) : '';

        if ($slug === '') {
            self::render_error_page(__('Hiányzó NGO paraméter.', 'impactshop'), 400);
            return;
        }

        $dataset = self::get_dataset(true);
        if (!$dataset || !isset($dataset['items'][$slug])) {
            self::render_error_page(__('Az adott NGO kártya nem található.', 'impactshop'), 404);
            return;
        }

        $item = $dataset['items'][$slug];
        self::render_wallet_template($item, $loc);
        exit;
    }

    private static function render_wallet_template(array $item, string $locHash): void
    {
        $slug   = $item['slug'];
        $name   = $item['name'] ?? $slug;
        $amount = $item['amount']['formatted'] ?? '';
        $rank   = (int) ($item['rank'] ?? 0);
        $context = $locHash !== '' ? 'ngo-card-qr-' . $locHash : 'ngo-card-qr';
        $ctaExtras = [];
        if ($locHash !== '') {
            $ctaExtras['qr_loc'] = $locHash;
        }
        $ctaUrl = self::cta_url($slug, $context, $ctaExtras);
        $shareUrl = self::share_url($slug);
        $resetUrl = self::reset_url();

        $title = sprintf('%s – QR kampány', $name);
        $locLabel = $locHash !== '' ? sprintf(__('Helyszín: %s', 'impactshop'), strtoupper($locHash)) : __('QR kampány', 'impactshop');
        $description = sprintf(
            __('A(z) %1$s jelenleg #%2$d a Sharity toplistán, eddig %3$s támogatás gyűlt össze. Támogasd te is az Impact Shopban!', 'impactshop'),
            $name,
            $rank,
            $amount
        );

        $canonicalArgs = ['ngo' => $slug];
        if ($locHash !== '') {
            $canonicalArgs['qr_loc'] = $locHash;
        }
        $canonicalUrl = add_query_arg($canonicalArgs, home_url('/wallet/add/'));
        $qrImage = sprintf(
            'https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=%s',
            rawurlencode($ctaUrl)
        );
        $shareEncoded = rawurlencode($shareUrl);
        $shareLinks = [
            'facebook' => 'https://www.facebook.com/sharer/sharer.php?u=' . $shareEncoded,
            'linkedin' => sprintf(
                'https://www.linkedin.com/sharing/share-offsite/?%s',
                http_build_query([
                    'url' => $shareUrl,
                    'title' => $title,
                    'summary' => $description,
                ])
            ),
            'tiktok'   => 'https://www.tiktok.com/discover/?url=' . $shareEncoded,
        ];
        $shareMessage = sprintf(
            __('Támogasd te is a %1$s az Impact Shopban: vásárolj kedvezménnyel, neked nem kerül többe – a támogatás pedig jó helyre érkezik. Sőt, a vásárlásoddal még nyereményeket is bezsebelhetsz!%2$s👉 %3$s', 'impactshop'),
            $name,
            PHP_EOL . PHP_EOL,
            $ctaUrl
        );

        nocache_headers();
        ?>
<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="utf-8">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?php echo esc_html($title); ?></title>
  <meta name="description" content="<?php echo esc_attr($name . ' QR kampány oldal – Impact Shop támogatás.'); ?>">
  <link rel="canonical" href="<?php echo esc_url($canonicalUrl); ?>">
  <style>
    body {
      margin: 0;
      font-family: "Inter", "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      background: radial-gradient(900px 450px at 0% -30%, rgba(34,211,238,0.18), transparent), #020617;
      color: #e0f2fe;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 2.5rem 1.5rem;
      text-align: center;
    }
    .impact-wallet-landing {
      background: rgba(15, 23, 42, 0.88);
      border-radius: 26px;
      padding: clamp(2rem, 3vw, 3.5rem);
      max-width: 760px;
      width: 95%;
      box-shadow: 0 32px 70px rgba(2, 6, 23, 0.55);
    }
    .impact-wallet-landing__grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: clamp(1.5rem, 3vw, 2.75rem);
      align-items: center;
    }
    .impact-wallet-landing__col {
      display: grid;
      gap: 1.2rem;
    }
    .impact-wallet-landing__col--info {
      justify-items: flex-start;
      text-align: left;
    }
    .impact-wallet-landing__col--qr {
      justify-items: center;
    }
    .impact-wallet-landing h1 {
      margin: 0;
      font-size: clamp(1.9rem, 2.4vw, 2.3rem);
    }
    .impact-wallet-landing__stats {
      display: grid;
      gap: 0.35rem;
      font-size: 0.95rem;
      color: rgba(226, 232, 240, 0.9);
    }
    .impact-wallet-landing__qr img {
      max-width: 240px;
      border-radius: 20px;
      background: #fff;
      padding: 1.2rem;
      box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.1), 0 18px 40px rgba(14, 116, 144, 0.24);
    }
    .impact-wallet-landing__qr small {
      display: block;
      margin-top: 0.6rem;
      font-size: 0.78rem;
      color: rgba(148, 163, 184, 0.85);
      text-align: center;
    }
    .impact-wallet-landing__cta {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.55rem;
      border-radius: 999px;
      padding: 0.85rem 1.9rem;
      background: linear-gradient(135deg, #38bdf8, #2563eb);
      color: #021826;
      font-weight: 700;
      text-decoration: none;
      box-shadow: 0 22px 48px rgba(56, 189, 248, 0.35);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .impact-wallet-landing__cta:focus-visible {
      outline: 3px solid rgba(56, 189, 248, 0.9);
      outline-offset: 4px;
    }
    .impact-wallet-landing__cta:hover {
      transform: translateY(-2px);
      box-shadow: 0 24px 54px rgba(56, 189, 248, 0.4);
    }
    .impact-wallet-landing__share {
      font-size: 0.85rem;
      color: rgba(148, 163, 184, 0.9);
      display: grid;
      gap: 0.4rem;
      justify-items: flex-start;
      width: 100%;
    }
    .impact-wallet-card-form {
      display: grid;
      gap: 0.9rem;
      padding: 1rem 1.2rem;
      background: rgba(15, 23, 42, 0.65);
      border-radius: 18px;
      border: 1px solid rgba(56, 189, 248, 0.18);
      width: min(100%, 360px);
    }
    .impact-wallet-card-form h2 {
      margin: 0;
      font-size: 1.1rem;
      color: #e0f2fe;
    }
    .impact-wallet-card-form__row label {
      display: grid;
      gap: 0.35rem;
      font-size: 0.85rem;
      color: rgba(226, 232, 240, 0.9);
    }
    .impact-wallet-card-form input[type="text"],
    .impact-wallet-card-form input[type="email"] {
      background: rgba(2, 6, 23, 0.55);
      border: 1px solid rgba(148, 163, 184, 0.4);
      border-radius: 10px;
      padding: 0.6rem 0.75rem;
      color: #e2e8f0;
      font-size: 0.95rem;
    }
    .impact-wallet-card-form input[type="text"]:focus,
    .impact-wallet-card-form input[type="email"]:focus {
      outline: 2px solid rgba(56, 189, 248, 0.75);
      border-color: rgba(56, 189, 248, 0.75);
    }
    .impact-wallet-card-form__consent {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      font-size: 0.78rem;
      color: rgba(226, 232, 240, 0.85);
    }
    .impact-wallet-card-form__submit {
      background: linear-gradient(135deg, #38bdf8, #2563eb);
      color: #021826;
      border: none;
      border-radius: 999px;
      padding: 0.7rem 1.2rem;
      font-weight: 700;
      cursor: pointer;
      transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
    }
    .impact-wallet-card-form__submit:hover {
      transform: translateY(-1px);
      box-shadow: 0 16px 32px rgba(56, 189, 248, 0.3);
    }
    .impact-wallet-card-form__submit:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }
    .impact-wallet-card-form__status {
      font-size: 0.8rem;
      color: rgba(148, 163, 184, 0.9);
      min-height: 1.2rem;
    }
    .impact-wallet-card-form__status--error {
      color: #fca5a5;
    }
    .impact-wallet-landing__copy {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
      padding: 0.55rem 1.1rem;
      border-radius: 999px;
      border: 1px solid rgba(148, 163, 184, 0.4);
      background: rgba(15, 23, 42, 0.6);
      color: #e2e8f0;
      cursor: pointer;
      font-size: 0.8rem;
      transition: border-color 0.2s ease;
    }
    .impact-wallet-landing__copy:hover,
    .impact-wallet-landing__copy:focus-visible {
      border-color: rgba(56, 189, 248, 0.8);
      outline: none;
    }
    .impact-wallet-landing__helper {
      font-size: 0.75rem;
      color: rgba(148, 163, 184, 0.75);
    }
    .impact-wallet-landing__social {
      display: flex;
      gap: 0.6rem;
      justify-content: center;
      margin-top: 0.3rem;
      flex-wrap: wrap;
      justify-content: flex-start;
    }
    .impact-wallet-landing__social a {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.55rem 0.9rem;
      border-radius: 999px;
      background: rgba(56, 189, 248, 0.14);
      color: #e0f2fe;
      text-decoration: none;
      font-size: 0.78rem;
      transition: background 0.2s ease, transform 0.2s ease;
    }
    .impact-wallet-landing__social a:hover,
    .impact-wallet-landing__social a:focus-visible {
      background: rgba(56, 189, 248, 0.25);
    }
    .impact-wallet-landing__current {
      margin-top: 0.85rem;
      font-size: 0.9rem;
      color: rgba(226, 232, 240, 0.9);
    }
    .impact-wallet-landing__current strong {
      color: #f8fafc;
    }
    .impact-wallet-landing__reset {
      display:inline-flex;
      align-items:center;
      justify-content:center;
      gap:0.4rem;
      padding:0.55rem 1.35rem;
      margin-top:0.5rem;
      border-radius:999px;
      border:1px solid rgba(148,163,184,0.45);
      color:#e2e8f0;
      text-decoration:none;
      font-size:0.9rem;
      font-weight:600;
      background:rgba(15,23,42,0.55);
      box-shadow:0 12px 26px rgba(15,23,42,0.35);
      backdrop-filter:blur(12px);
      -webkit-backdrop-filter:blur(12px);
      transition:all 0.2s ease;
    }
    .impact-wallet-landing__reset:hover,
    .impact-wallet-landing__reset:focus-visible {
      border-color:rgba(56,189,248,0.8);
      color:#f0f9ff;
      box-shadow:0 16px 32px rgba(56,189,248,0.25);
      transform:translateY(-1px);
      outline:none;
    }
  </style>
</head>
<body>
  <main class="impact-wallet-landing">
    <div class="impact-wallet-landing__grid">
      <div class="impact-wallet-landing__col impact-wallet-landing__col--info">
        <h1><?php echo esc_html($name); ?></h1>
        <div class="impact-wallet-landing__stats">
          <span><?php echo esc_html($locLabel); ?></span>
          <span><?php echo esc_html(sprintf(__('Összegyűjtve: %s', 'impactshop'), $amount)); ?></span>
          <span><?php echo esc_html(sprintf(__('Aktuális helyezés: #%d', 'impactshop'), $rank)); ?></span>
        </div>
        <?php if ($resetUrl !== '') : ?>
        <p class="impact-wallet-landing__current">
          <?php printf(esc_html__('Jelenleg a %s ügyét támogatod.', 'impactshop'), '<strong>' . esc_html($name) . '</strong>'); ?>
        </p>
        <a class="impact-wallet-landing__reset" href="<?php echo esc_url($resetUrl); ?>">
          <?php esc_html_e('Más ügyet támogatok', 'impactshop'); ?>
        </a>
        <?php endif; ?>
        <a class="impact-wallet-landing__cta" data-analytics="qr-cta" href="<?php echo esc_url($ctaUrl); ?>" target="_blank" rel="noopener">
          <?php esc_html_e('Tovább az Impact Shopba', 'impactshop'); ?>
        </a>
        <form class="impact-wallet-card-form" data-endpoint="<?php echo esc_url(rest_url('impact/v1/ngo-card/' . $slug . '/card-request')); ?>">
          <h2><?php esc_html_e('Kérd e-mailben a kártyát', 'impactshop'); ?></h2>
          <div class="impact-wallet-card-form__row">
            <label>
              <?php esc_html_e('Neved (opcionális)', 'impactshop'); ?>
              <input type="text" name="name" autocomplete="name">
            </label>
          </div>
          <div class="impact-wallet-card-form__row">
            <label>
              <?php esc_html_e('E-mail címed', 'impactshop'); ?>
              <input type="email" name="email" required autocomplete="email">
            </label>
          </div>
          <label class="impact-wallet-card-form__consent">
            <input type="checkbox" name="consent" value="1" required>
            <span><?php esc_html_e('Hozzájárulok, hogy a Sharity e-mailben elküldje a kártyát.', 'impactshop'); ?></span>
          </label>
          <button type="submit" class="impact-wallet-card-form__submit">
            <?php esc_html_e('Kérem e-mailben', 'impactshop'); ?>
          </button>
          <div class="impact-wallet-card-form__status" aria-live="polite"></div>
        </form>
        <div class="impact-wallet-landing__share" data-analytics="qr-share">
          <button type="button" class="impact-wallet-landing__copy" data-copy="<?php echo esc_attr($shareUrl); ?>">
            <?php esc_html_e('Link másolása', 'impactshop'); ?>
          </button>
          <button type="button" class="impact-wallet-landing__copy impact-wallet-landing__copy--text" data-copy="<?php echo esc_attr($shareMessage); ?>">
            <?php esc_html_e('Szöveg másolása', 'impactshop'); ?>
          </button>
          <span class="impact-wallet-landing__helper" aria-live="polite"></span>
          <div class="impact-wallet-landing__social">
            <a href="<?php echo esc_url($shareLinks['facebook']); ?>" data-share-platform="facebook" rel="noopener" target="_blank">
              <?php esc_html_e('Facebook', 'impactshop'); ?>
            </a>
            <a href="<?php echo esc_url($shareLinks['linkedin']); ?>" data-share-platform="linkedin" rel="noopener" target="_blank">
              <?php esc_html_e('LinkedIn', 'impactshop'); ?>
            </a>
            <a href="<?php echo esc_url($shareLinks['tiktok']); ?>" data-share-platform="tiktok" rel="noopener" target="_blank">
              <?php esc_html_e('TikTok', 'impactshop'); ?>
            </a>
          </div>
        </div>
      </div>
      <div class="impact-wallet-landing__col impact-wallet-landing__col--qr">
        <div class="impact-wallet-landing__qr">
          <img src="<?php echo esc_url($qrImage); ?>" alt="<?php echo esc_attr__('QR-kód az Impact Shop oldalhoz', 'impactshop'); ?>">
          <small><?php esc_html_e('Szkenneld a QR-kódot és támogass az Impact Shopban.', 'impactshop'); ?></small>
        </div>
      </div>
    </div>
  </main>
  <script>
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: 'qr_view',
      ngo: '<?php echo esc_js($slug); ?>',
      loc: '<?php echo esc_js($locHash); ?>'
    });

    (function() {
      var cta = document.querySelector('[data-analytics=\"qr-cta\"]');
      if (cta) {
        cta.addEventListener('click', function() {
          window.dataLayer = window.dataLayer || [];
          window.dataLayer.push({
            event: 'qr_cta_click',
            ngo: '<?php echo esc_js($slug); ?>',
            loc: '<?php echo esc_js($locHash); ?>'
          });
        });
      }

      var form = document.querySelector('.impact-wallet-card-form');
      if (form) {
        var formEndpoint = form.getAttribute('data-endpoint');
        var statusBox = form.querySelector('.impact-wallet-card-form__status');
        form.addEventListener('submit', function(evt) {
          evt.preventDefault();
          if (!formEndpoint) {
            return;
          }
          var formData = new FormData(form);
          var payload = {
            name: formData.get('name') || '',
            email: formData.get('email') || '',
            consent: formData.get('consent') ? true : false,
            loc: '<?php echo esc_js($locHash); ?>'
          };
          if (statusBox) {
            statusBox.textContent = '<?php echo esc_js(__('Kártya küldése folyamatban…', 'impactshop')); ?>';
          }
          var submitBtn = form.querySelector('.impact-wallet-card-form__submit');
          if (submitBtn) {
            submitBtn.disabled = true;
          }
          fetch(formEndpoint, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
          }).then(function(res) {
            return res.json().then(function(body) {
              return {ok: res.ok, body: body};
            });
          }).then(function(result) {
            var message = '';
            if (result.body && typeof result.body.message === 'string' && result.body.message.length > 0) {
              message = result.body.message;
            } else if (result.body && result.body.data && typeof result.body.data.message === 'string') {
              message = result.body.data.message;
            } else if (result.ok) {
              message = '<?php echo esc_js(__('A kártya kérése feldolgozásra került.', 'impactshop')); ?>';
            } else {
              message = '<?php echo esc_js(__('Ismeretlen válasz érkezett.', 'impactshop')); ?>';
            }
            if (statusBox) {
              statusBox.textContent = message;
              statusBox.classList.toggle('impact-wallet-card-form__status--error', !result.ok);
            }
            if (result.ok) {
              form.reset();
              window.dataLayer = window.dataLayer || [];
              window.dataLayer.push({
                event: 'qr_card_requested',
                ngo: '<?php echo esc_js($slug); ?>',
                loc: '<?php echo esc_js($locHash); ?>'
              });
            }
          }).catch(function() {
            if (statusBox) {
              statusBox.textContent = '<?php echo esc_js(__('Nem sikerült elküldeni a kérést. Próbáld újra később.', 'impactshop')); ?>';
            }
          }).finally(function() {
            if (submitBtn) {
              submitBtn.disabled = false;
            }
          });
        });
      }

      var shareBox = document.querySelector('[data-analytics=\"qr-share\"]');
      if (!shareBox) {
        return;
      }

      var copyButtons = shareBox.querySelectorAll('button[data-copy]');
      var helper = shareBox.querySelector('.impact-wallet-landing__helper');
      if (copyButtons.length && helper) {
        copyButtons.forEach(function(btn) {
          btn.addEventListener('click', function() {
            var value = btn.getAttribute('data-copy');
            navigator.clipboard.writeText(value).then(function() {
              helper.textContent = btn.classList.contains('impact-wallet-landing__copy--text')
                ? '<?php echo esc_js(__('Szöveg kimásolva a vágólapra.', 'impactshop')); ?>'
                : '<?php echo esc_js(__('Link kimásolva a vágólapra.', 'impactshop')); ?>';
              window.dataLayer = window.dataLayer || [];
              window.dataLayer.push({
                event: btn.classList.contains('impact-wallet-landing__copy--text') ? 'qr_text_copied' : 'qr_link_copied',
                ngo: '<?php echo esc_js($slug); ?>',
                loc: '<?php echo esc_js($locHash); ?>'
              });
            }).catch(function() {
              helper.textContent = value;
            });
          });
        });
      }

      var socials = shareBox.querySelectorAll('[data-share-platform]');
      socials.forEach(function(link) {
        link.addEventListener('click', function() {
          var platform = link.getAttribute('data-share-platform') || 'unknown';
          window.dataLayer = window.dataLayer || [];
          window.dataLayer.push({
            event: 'qr_social_share',
            ngo: '<?php echo esc_js($slug); ?>',
            loc: '<?php echo esc_js($locHash); ?>',
            platform: platform
          });
        });
      });
    })();
  </script>
</body>
</html>
        <?php
    }

    private static function render_error_page(string $message, int $status = 400): void
    {
        status_header($status);
        nocache_headers();
        ?>
<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="utf-8">
  <title><?php echo esc_html($status); ?> – Impact Shop</title>
  <style>
    body {
      margin: 0;
      font-family: "Inter", "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      background: #0f172a;
      color: #f8fafc;
      display: grid;
      place-items: center;
      min-height: 100vh;
    }
    main {
      text-align: center;
      padding: 2rem;
    }
    h1 {
      font-size: 2rem;
      margin-bottom: 0.5rem;
    }
  </style>
</head>
<body>
  <main>
    <h1><?php echo esc_html($message); ?></h1>
    <p>(<?php echo esc_html($status); ?>)</p>
  </main>
</body>
</html>
        <?php
        exit;
    }

    private static function is_share_crawler(): bool
    {
        $ua = strtolower($_SERVER['HTTP_USER_AGENT'] ?? '');
        if ($ua === '') {
            return false;
        }

        $keywords = [
            'facebookexternalhit',
            'facebot',
            'linkedinbot',
            'twitterbot',
            'slackbot',
            'whatsapp',
            'discordbot',
            'telegrambot',
            'pinterestbot',
            'vkshare',
            'embedly',
        ];

        foreach ($keywords as $needle) {
            if (strpos($ua, $needle) !== false) {
                return true;
            }
        }

        return false;
    }

    private static function og_image_url(string $slug): string
    {
        $slug = sanitize_title($slug);
        if ($slug === '') {
            return self::FALLBACK_OG_IMAGE;
        }

        $upload = wp_upload_dir();
        if (empty($upload['basedir']) || empty($upload['baseurl'])) {
            return self::FALLBACK_OG_IMAGE;
        }

        $relative = '/impactshop/og-images/' . $slug . '.jpg';
        $path     = $upload['basedir'] . $relative;
        if (file_exists($path)) {
            return $upload['baseurl'] . $relative;
        }

        return self::FALLBACK_OG_IMAGE;
    }

    private static function resolve_card_asset(string $slug): array
    {
        $slug = sanitize_title($slug);
        if ($slug === '') {
            return [null, null];
        }

        $upload = wp_upload_dir();
        if (empty($upload['basedir']) || empty($upload['baseurl'])) {
            return [null, null];
        }

        $relative = '/impactshop/og-images/' . $slug . '.jpg';
        $path     = $upload['basedir'] . $relative;
        $url      = $upload['baseurl'] . $relative;

        if (file_exists($path) && is_readable($path)) {
            return [$path, $url];
        }

        return [null, null];
    }

    public static function get_item(string $slug): ?array
    {
        $slug = sanitize_title($slug);
        if ($slug === '') {
            return null;
        }

        $dataset = self::get_dataset(true);
        if (!$dataset || empty($dataset['items'][$slug])) {
            return null;
        }

        return $dataset['items'][$slug];
    }

    private static function card_asset_location(string $slug): array
    {
        $slug = sanitize_title($slug);
        if ($slug === '') {
            return [null, null];
        }

        $upload = wp_upload_dir();
        if (empty($upload['basedir']) || empty($upload['baseurl'])) {
            return [null, null];
        }

        $relative = '/impactshop/og-images/' . $slug . '.jpg';
        $path     = $upload['basedir'] . $relative;
        $url      = $upload['baseurl'] . $relative;

        return [$path, $url];
    }

    public static function all_items_for_embed(): array
    {
        $dataset = self::get_dataset(true);
        if (!$dataset || empty($dataset['items']) || !is_array($dataset['items'])) {
            return [];
        }

        $items = [];
        foreach ($dataset['items'] as $slug => $item) {
            $items[] = [
                'slug'             => $slug,
                'name'             => $item['name'] ?? $slug,
                'rank'             => isset($item['rank']) ? (int) $item['rank'] : 0,
                'amount_formatted' => $item['amount']['formatted'] ?? '',
                'share_url'        => $item['share_url'] ?? '',
            ];
        }

        return $items;
    }

    private static function get_or_generate_card_asset(string $slug, array $item): array
    {
        [$path, $url] = self::resolve_card_asset($slug);
        if (!$path || !$url) {
            [$path, $url] = self::card_asset_location($slug);
        }

        if (!$path || !$url) {
            return [null, null];
        }

        $needsRegenerate = true;
        if (file_exists($path)) {
            $size    = max(0, (int) filesize($path));
            $age     = time() - (int) filemtime($path);
            $isTiny  = $size > 0 && $size <= 4096;
            $isStale = $age > DAY_IN_SECONDS;
            if (!$isTiny && !$isStale) {
                $needsRegenerate = false;
            }
        }

        if ($needsRegenerate) {
            if (!self::generate_card_asset($slug, $item, $path)) {
                if (!file_exists($path)) {
                    return [null, null];
                }
            }
        }

        if (!file_exists($path)) {
            return [null, null];
        }

        return [$path, $url];
    }

    private static function generate_card_asset(string $slug, array $item, string $path): bool
    {
        if (!self::gd_available()) {
            return false;
        }

        [$fontRegular, $fontBold] = self::font_paths();
        $width  = 1200;
        $height = 630;

        $image = imagecreatetruecolor($width, $height);
        if (!$image) {
            return false;
        }

        imageantialias($image, true);
        imagealphablending($image, true);

        imagefilledrectangle($image, 0, 0, $width, $height, imagecolorallocate($image, 2, 6, 23));
        self::draw_dark_glow($image, $width, $height);

        $cardX1 = 80;
        $cardY1 = 80;
        $cardX2 = $width - 80;
        $cardY2 = $height - 80;
        $radius = 46;

        self::draw_card_panel($image, $cardX1, $cardY1, $cardX2, $cardY2, $radius);

        $contentX = $cardX1 + 90;
        $contentWidth = $cardX2 - $contentX - 400;
        $currentY = $cardY1 + 90;

        if ($fontBold) {
            $labelColor = imagecolorallocate($image, 120, 200, 255);
            $currentY = self::draw_ttf_line(
                $image,
                __('Impact Shop', 'impactshop'),
                $fontBold,
                30,
                $contentX,
                $currentY,
                $labelColor,
                [0, 0, 0, 110],
                2
            );
            $currentY += self::line_gap($fontBold, 30);
        } else {
            $labelColor = imagecolorallocate($image, 120, 200, 255);
            imagestring($image, 5, $contentX, $currentY - 20, 'Impact Shop', $labelColor);
            $currentY += 40;
        }

        $ngoName = (string) ($item['name'] ?? $slug);
        $nameColor = imagecolorallocate($image, 226, 232, 240);
        if ($fontBold) {
            $lines = self::wrap_text($ngoName, $fontBold, 64, $contentWidth);
            $lineGap = self::line_gap($fontBold, 64);
            $total = count($lines);
            foreach ($lines as $idx => $line) {
                $currentY = self::draw_ttf_line(
                    $image,
                    $line,
                    $fontBold,
                    64,
                    $contentX,
                    $currentY,
                    $nameColor,
                    [0, 0, 0, 120],
                    3
                );
                if ($idx < $total - 1) {
                    $currentY += $lineGap;
                }
            }
            $currentY += $lineGap;
        } else {
            imagestring($image, 5, $contentX, $currentY - 40, $ngoName, $nameColor);
            $currentY += 40;
        }

        $amountFormatted = (string) ($item['amount']['formatted'] ?? '');
        $amountColor = imagecolorallocate($image, 59, 130, 246);
        if ($fontBold) {
            $currentY = self::draw_ttf_line(
                $image,
                $amountFormatted,
                $fontBold,
                80,
                $contentX,
                $currentY,
                $amountColor,
                [0, 0, 0, 120],
                3
            );
            $currentY += self::line_gap($fontBold, 80);
        } else {
            imagestring($image, 5, $contentX, $currentY - 40, $amountFormatted, $amountColor);
            $currentY += 40;
        }

        $rank = (int) ($item['rank'] ?? 0);
        if ($rank > 0) {
            $rankText = sprintf('#%d a toplistán', $rank);
            $rankColor = imagecolorallocate($image, 148, 163, 184);
            if ($fontBold) {
                $currentY = self::draw_ttf_line(
                    $image,
                    $rankText,
                    $fontBold,
                    32,
                    $contentX,
                    $currentY,
                    $rankColor,
                    [0, 0, 0, 120],
                    2
                );
                $currentY += self::line_gap($fontBold, 32);
            } else {
                imagestring($image, 4, $contentX, $currentY - 30, $rankText, $rankColor);
                $currentY += 32;
            }
        }

        if (!empty($item['next_milestone']) && isset($item['next_milestone']['remaining'], $item['next_milestone']['value'])) {
            $remaining = (int) $item['next_milestone']['remaining'];
            $milestone = (int) $item['next_milestone']['value'];
            if ($remaining > 0) {
                $milestoneText = sprintf(
                    'Hiányzik %s Ft a %s Ft mérföldkőig',
                    self::format_huf($remaining),
                    self::format_huf($milestone)
                );
                $milestoneColor = imagecolorallocate($image, 148, 163, 184);
                if ($fontRegular) {
                    $lines = self::wrap_text($milestoneText, $fontRegular, 32, $contentWidth);
                    $lineGap = self::line_gap($fontRegular, 32);
                    foreach ($lines as $idx => $line) {
                        $currentY = self::draw_ttf_line(
                            $image,
                            $line,
                            $fontRegular,
                            32,
                            $contentX,
                            $currentY,
                            $milestoneColor,
                            [0, 0, 0, 100],
                            2
                        );
                        if ($idx < count($lines) - 1) {
                            $currentY += $lineGap;
                        }
                    }
                    $currentY += $lineGap;
                } else {
                    imagestring($image, 3, $contentX, $currentY - 32, $milestoneText, $milestoneColor);
                    $currentY += 32;
                }
            }
        }

        $ctaTop = max($currentY + 30, $cardY1 + 380);
        $ctaText = __('Tovább az Impact Shopba', 'impactshop');
        if ($fontBold) {
            self::draw_button($image, $contentX, $ctaTop, 380, 78, [96, 207, 255], [48, 133, 255], $ctaText, $fontBold, 32, imagecolorallocate($image, 10, 16, 32));
        } else {
            imagestring($image, 5, $contentX, $ctaTop, $ctaText, imagecolorallocate($image, 147, 197, 253));
        }

        $slugColor = imagecolorallocate($image, 100, 116, 139);
        $slugText = sprintf('impactshop.hu/%s', $slug);
        if ($fontRegular) {
            self::draw_ttf_line(
                $image,
                $slugText,
                $fontRegular,
                28,
                $contentX,
                $ctaTop + 110,
                $slugColor,
                [0, 0, 0, 120],
                2
            );
        } else {
            imagestring($image, 3, $contentX, $ctaTop + 120, $slugText, $slugColor);
        }

        $qrSize = 320;
        $qrX = $cardX2 - $qrSize - 120;
        $qrY = $cardY1 + 100;
        self::draw_qr_section($image, $qrX, $qrY, $qrSize, $slug, $item);

        wp_mkdir_p(dirname($path));
        imagejpeg($image, $path, 90);
        imagedestroy($image);

        return file_exists($path);
    }

    private static function gd_available(): bool
    {
        return extension_loaded('gd') && function_exists('imagecreatetruecolor');
    }

    private static function font_paths(): array
    {
        static $cached = null;
        if (is_array($cached)) {
            return $cached;
        }

        $regularCandidates = array_filter([
            self::asset_path(self::FONT_REGULAR),
            '/usr/share/fonts/dejavu/DejaVuSans.ttf',
            '/usr/share/fonts/dejavu/DejaVuSansCondensed.ttf',
            '/usr/share/fonts/dejavu/DejaVuSansMono.ttf',
        ]);

        $boldCandidates = array_filter([
            self::asset_path(self::FONT_BOLD),
            '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
            '/usr/share/fonts/dejavu/DejaVuSansCondensed-Bold.ttf',
            '/usr/share/fonts/dejavu/DejaVuSansMono-Bold.ttf',
        ]);

        $regular = self::pick_usable_font($regularCandidates);
        $bold    = self::pick_usable_font($boldCandidates);

        $cached = [$regular, $bold];
        return $cached;
    }

    private static function pick_usable_font(array $candidates): ?string
    {
        foreach ($candidates as $candidate) {
            if (!is_string($candidate) || $candidate === '') {
                continue;
            }
            if (!is_readable($candidate)) {
                continue;
            }
            if (!self::gd_available() || !function_exists('imagettftext')) {
                return null;
            }
            $test = imagecreatetruecolor(20, 20);
            if (!$test) {
                return null;
            }
            imagealphablending($test, true);
            $bg = imagecolorallocate($test, 255, 255, 255);
            imagefilledrectangle($test, 0, 0, 19, 19, $bg);
            $fg = imagecolorallocate($test, 0, 0, 0);
            $result = @imagettftext($test, 8, 0, 1, 12, $fg, $candidate, 'A');
            imagedestroy($test);
            if ($result !== false) {
                return $candidate;
            }
        }
        return null;
    }

    private static function asset_path(string $relative): ?string
    {
        $base = self::ASSET_DIR;
        if (!is_dir($base)) {
            return null;
        }
        $path = $base . '/' . ltrim($relative, '/');
        if (!file_exists($path)) {
            return null;
        }
        return $path;
    }

    private static function load_asset_image(string $relative)
    {
        $path = self::asset_path($relative);
        if (!$path) {
            return null;
        }
        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        if ($ext === 'png') {
            return imagecreatefrompng($path);
        }
        if ($ext === 'jpg' || $ext === 'jpeg') {
            return imagecreatefromjpeg($path);
        }
        return null;
    }

    private static function draw_background_gradient($image, int $width, int $height, array $start, array $end): void
    {
        for ($y = 0; $y < $height; $y++) {
            $ratio = $height > 1 ? $y / ($height - 1) : 0;
            $r = (int) round($start[0] + ($end[0] - $start[0]) * $ratio);
            $g = (int) round($start[1] + ($end[1] - $start[1]) * $ratio);
            $b = (int) round($start[2] + ($end[2] - $start[2]) * $ratio);
            $color = imagecolorallocate($image, $r, $g, $b);
            imageline($image, 0, $y, $width, $y, $color);
        }
    }

    private static function draw_overlay_glow($image, int $width, int $height): void
    {
        $glow = imagecolorallocatealpha($image, 44, 116, 255, 100);
        imagefilledellipse(
            $image,
            (int) ($width * 0.82),
            (int) ($height * 0.16),
            (int) ($width * 0.82),
            (int) ($height * 0.82),
            $glow
        );

        $steps = 70;
        for ($i = 0; $i < $steps; $i++) {
            $ratio = $i / max(1, $steps - 1);
            $alpha = (int) min(127, 80 + 40 * $ratio);
            $color = imagecolorallocatealpha($image, 255, 255, 255, $alpha);
            imagefilledellipse(
                $image,
                (int) ($width / 2),
                (int) ($height * 0.96),
                (int) ($width * (1 - 0.15 * $ratio)),
                (int) ($height * 0.26 * (1 - 0.5 * $ratio)),
                $color
            );
        }
    }

    private static function draw_rounded_rect($image, int $x1, int $y1, int $x2, int $y2, int $radius, int $color): void
    {
        if ($radius <= 0) {
            imagefilledrectangle($image, $x1, $y1, $x2, $y2, $color);
            return;
        }

        imagefilledrectangle($image, $x1 + $radius, $y1, $x2 - $radius, $y2, $color);
        imagefilledrectangle($image, $x1, $y1 + $radius, $x2, $y2 - $radius, $color);

        imagefilledellipse($image, $x1 + $radius, $y1 + $radius, $radius * 2, $radius * 2, $color);
        imagefilledellipse($image, $x2 - $radius, $y1 + $radius, $radius * 2, $radius * 2, $color);
        imagefilledellipse($image, $x1 + $radius, $y2 - $radius, $radius * 2, $radius * 2, $color);
        imagefilledellipse($image, $x2 - $radius, $y2 - $radius, $radius * 2, $radius * 2, $color);
    }

    private static function draw_vertical_gradient($image, int $width, int $height, int $radius, array $top, array $bottom): void
    {
        for ($y = 0; $y < $height; $y++) {
            $ratio = $height > 1 ? $y / ($height - 1) : 0;
            $r = (int) round($top[0] + ($bottom[0] - $top[0]) * $ratio);
            $g = (int) round($top[1] + ($bottom[1] - $top[1]) * $ratio);
            $b = (int) round($top[2] + ($bottom[2] - $top[2]) * $ratio);
            $color = imagecolorallocatealpha($image, $r, $g, $b, 0);

            $left = 0;
            $right = $width - 1;

            if ($radius > 0) {
                if ($y < $radius) {
                    $dy = $radius - $y;
                    $dx = sqrt(max(0, $radius * $radius - $dy * $dy));
                    $left = (int) ceil($radius - $dx);
                    $right = (int) floor($width - $radius + $dx);
                } elseif ($y >= $height - $radius) {
                    $dy = $y - ($height - $radius - 1);
                    $dx = sqrt(max(0, $radius * $radius - $dy * $dy));
                    $left = (int) ceil($radius - $dx);
                    $right = (int) floor($width - $radius + $dx);
                }
            }

            imageline($image, $left, $y, $right, $y, $color);
        }
    }

    private static function draw_dark_glow($image, int $width, int $height): void
    {
        $glow = imagecolorallocatealpha($image, 37, 144, 250, 95);
        imagefilledellipse(
            $image,
            (int) ($width * 0.78),
            (int) ($height * 0.18),
            (int) ($width * 0.9),
            (int) ($height * 0.9),
            $glow
        );
        $ambient = imagecolorallocatealpha($image, 8, 13, 32, 110);
        imagefilledellipse(
            $image,
            (int) ($width * 0.3),
            (int) ($height * 0.95),
            (int) ($width * 0.9),
            (int) ($height * 0.5),
            $ambient
        );
    }

    private static function draw_card_panel($image, int $x1, int $y1, int $x2, int $y2, int $radius): void
    {
        $shadow = imagecolorallocatealpha($image, 4, 8, 26, 110);
        self::draw_rounded_rect($image, $x1 + 26, $y1 + 34, $x2 + 26, $y2 + 34, $radius + 6, $shadow);

        $width = $x2 - $x1;
        $height = $y2 - $y1;

        $panel = imagecreatetruecolor($width, $height);
        imagealphablending($panel, false);
        imagesavealpha($panel, true);
        $transparent = imagecolorallocatealpha($panel, 0, 0, 0, 127);
        imagefill($panel, 0, 0, $transparent);

        self::draw_vertical_gradient($panel, $width, $height, $radius, [23, 35, 64], [8, 15, 34]);
        imagecopy($image, $panel, $x1, $y1, 0, 0, $width, $height);
        imagedestroy($panel);
    }

    private static function draw_button($image, int $x, int $y, int $width, int $height, array $startColor, array $endColor, string $text, string $font, float $fontSize, int $textColor): void
    {
        $button = imagecreatetruecolor($width, $height);
        imagealphablending($button, false);
        imagesavealpha($button, true);
        $transparent = imagecolorallocatealpha($button, 0, 0, 0, 127);
        imagefill($button, 0, 0, $transparent);

        for ($i = 0; $i < $height; $i++) {
            $ratio = $height > 1 ? $i / ($height - 1) : 0;
            $r = (int) round($startColor[0] + ($endColor[0] - $startColor[0]) * $ratio);
            $g = (int) round($startColor[1] + ($endColor[1] - $startColor[1]) * $ratio);
            $b = (int) round($startColor[2] + ($endColor[2] - $startColor[2]) * $ratio);
            $color = imagecolorallocatealpha($button, $r, $g, $b, 0);
            imageline($button, 0, $i, $width - 1, $i, $color);
        }

        self::draw_rounded_rect($button, 0, 0, $width - 1, $height - 1, (int) round($height / 2), imagecolorallocatealpha($button, 0, 0, 0, 0));
        $highlight = imagecolorallocatealpha($button, 255, 255, 255, 112);
        imagefilledarc($button, (int) ($width / 2), (int) ($height * 0.2), $width - 20, (int) ($height * 0.8), 0, 180, $highlight, IMG_ARC_PIE);
        imagecopy($image, $button, $x, $y, 0, 0, $width, $height);
        imagedestroy($button);

        if ($font && is_readable($font)) {
            $metrics = self::ttf_metrics($font, $fontSize, $text);
            $textWidth = self::text_width($font, $fontSize, $text);
            $textX = $x + (int) (($width - $textWidth) / 2);
            $textY = $y + (int) (($height - $metrics['height']) / 2) + $metrics['ascent'];
            @imagettftext($image, $fontSize, 0, $textX, $textY, $textColor, $font, $text);
        } else {
            $len = strlen($text);
            $approxWidth = $len * 7;
            $textX = $x + (int) (($width - $approxWidth) / 2);
            $textY = $y + (int) (($height - 12) / 2);
            imagestring($image, 4, $textX, $textY, $text, $textColor);
        }
    }

    private static function text_width(string $font, float $size, string $text): int
    {
        $bbox = @imagettfbbox($size, 0, $font, $text);
        if (!is_array($bbox)) {
            return (int) strlen($text) * (int) round($size * 0.5);
        }
        $xs = [$bbox[0], $bbox[2], $bbox[4], $bbox[6]];
        return max($xs) - min($xs);
    }

    private static function draw_qr_section($image, int $x, int $y, int $size, string $slug, array $item): void
    {
        $panelWidth = $size + 80;
        $panelHeight = $size + 160;

        $panel = imagecreatetruecolor($panelWidth, $panelHeight);
        imagealphablending($panel, false);
        imagesavealpha($panel, true);
        $transparent = imagecolorallocatealpha($panel, 0, 0, 0, 127);
        imagefill($panel, 0, 0, $transparent);

        $panelGradientTop = [26, 36, 66];
        $panelGradientBottom = [12, 20, 44];
        for ($i = 0; $i < $panelHeight; $i++) {
            $ratio = $panelHeight > 1 ? $i / ($panelHeight - 1) : 0;
            $r = (int) round($panelGradientTop[0] + ($panelGradientBottom[0] - $panelGradientTop[0]) * $ratio);
            $g = (int) round($panelGradientTop[1] + ($panelGradientBottom[1] - $panelGradientTop[1]) * $ratio);
            $b = (int) round($panelGradientTop[2] + ($panelGradientBottom[2] - $panelGradientTop[2]) * $ratio);
            $color = imagecolorallocatealpha($panel, $r, $g, $b, 0);
            imageline($panel, 0, $i, $panelWidth - 1, $i, $color);
        }

        self::draw_rounded_rect($panel, 0, 0, $panelWidth - 1, $panelHeight - 1, 36, imagecolorallocatealpha($panel, 0, 0, 0, 0));

        $qrUrl = self::cta_url($slug, 'ngo-card-share');
        $qrImage = self::fetch_qr_image(sprintf(
            'https://api.qrserver.com/v1/create-qr-code/?size=%1$dx%1$d&data=%2$s',
            $size,
            rawurlencode($qrUrl)
        ));

        if ($qrImage) {
            $qrX = (int) (($panelWidth - $size) / 2);
            $qrY = 36;
            imagecopyresampled($panel, $qrImage, $qrX, $qrY, 0, 0, $size, $size, imagesx($qrImage), imagesy($qrImage));
            imagedestroy($qrImage);
        }

        $caption = __('Szkenneld a QR-kódot és támogass az Impact Shopban.', 'impactshop');
        $fontPaths = self::font_paths();
        $font = $fontPaths[0] ?? '';
        $captionColor = imagecolorallocate($panel, 203, 213, 225);
        $captionTop = $size + 84;
        if ($font) {
            self::draw_ttf_line($panel, $caption, $font, 26, 32, $captionTop, $captionColor, [0, 0, 0, 120], 2);
        } else {
            imagestring($panel, 4, 32, $captionTop + 8, $caption, $captionColor);
        }

        imagecopy($image, $panel, $x, $y, 0, 0, $panelWidth, $panelHeight);
        imagedestroy($panel);
    }

    private static function fetch_qr_image(string $url)
    {
        $response = wp_remote_get($url, ['timeout' => 10]);
        if (is_wp_error($response)) {
            return null;
        }
        $code = wp_remote_retrieve_response_code($response);
        if ($code < 200 || $code >= 300) {
            return null;
        }
        $body = wp_remote_retrieve_body($response);
        if ($body === '') {
            return null;
        }
        $resource = @imagecreatefromstring($body);
        return $resource ?: null;
    }

    private static function wrap_text(string $text, string $fontFile, float $fontSize, int $maxWidth): array
    {
        if (!function_exists('imagettfbbox') || !is_readable($fontFile)) {
            return [$text];
        }
        $words = preg_split('/\s+/u', trim($text));
        if (!$words) {
            return [$text];
        }

        $lines = [];
        $current = '';

        foreach ($words as $word) {
            $trial = $current === '' ? $word : $current . ' ' . $word;
            $bbox = imagettfbbox($fontSize, 0, $fontFile, $trial);
            if (!$bbox) {
                $current = $trial;
                continue;
            }
            $trialWidth = abs($bbox[4] - $bbox[0]);
            if ($trialWidth > $maxWidth && $current !== '') {
                $lines[] = $current;
                $current = $word;
            } else {
                $current = $trial;
            }
        }

        if ($current !== '') {
            $lines[] = $current;
        }

        return $lines ?: [$text];
    }

    private static function format_huf(int $value): string
    {
        return number_format(max(0, $value), 0, ',', ' ');
    }

    private static function place_logo($image, int $x, int $y, int $targetWidth): int
    {
        $logo = self::load_asset_image(self::OG_LOGO);
        if (!$logo) {
            return 0;
        }

        imagealphablending($logo, true);
        imagesavealpha($logo, true);

        $srcW = imagesx($logo);
        $srcH = imagesy($logo);
        if ($srcW <= 0) {
            imagedestroy($logo);
            return 0;
        }

        $scale = $targetWidth / $srcW;
        $targetHeight = (int) round($srcH * $scale);

        $resized = imagecreatetruecolor($targetWidth, $targetHeight);
        imagesavealpha($resized, true);
        $transparent = imagecolorallocatealpha($resized, 0, 0, 0, 127);
        imagefill($resized, 0, 0, $transparent);
        imagecopyresampled($resized, $logo, 0, 0, 0, 0, $targetWidth, $targetHeight, $srcW, $srcH);
        imagedestroy($logo);

        imagecopy($image, $resized, $x, $y, 0, 0, $targetWidth, $targetHeight);
        imagedestroy($resized);

        return $targetHeight;
    }

    private static function draw_rank_badge($image, int $x, int $y, int $rank, bool $highQuality): void
    {
        $size = 180;
        $badge = imagecreatetruecolor($size, $size);
        imagesavealpha($badge, true);
        $transparent = imagecolorallocatealpha($badge, 0, 0, 0, 127);
        imagefill($badge, 0, 0, $transparent);

        $background = [14, 165, 233];
        if ($rank === 1) {
            $background = [251, 191, 36];
        } elseif ($rank === 2) {
            $background = [226, 232, 240];
        } elseif ($rank === 3) {
            $background = [251, 146, 60];
        }

        $badgeColor = imagecolorallocatealpha($badge, $background[0], $background[1], $background[2], 0);
        imagefilledellipse($badge, $size / 2, $size / 2, $size, $size, $badgeColor);

        $borderColor = imagecolorallocatealpha($badge, 15, 23, 42, 96);
        imageellipse($badge, $size / 2, $size / 2, $size - 4, $size - 4, $borderColor);

        $label = $rank > 0 ? '#' . $rank : '#–';
        if ($highQuality) {
            $font = self::asset_path(self::FONT_BOLD);
            if ($font && is_readable($font)) {
                $bbox = imagettfbbox(44, 0, $font, $label);
                $textWidth = abs($bbox[4] - $bbox[0]);
                $textHeight = abs($bbox[5] - $bbox[1]);
                $textX = (int) (($size - $textWidth) / 2);
                $textY = (int) (($size + $textHeight) / 2) - 8;
                $textColor = imagecolorallocatealpha($badge, 15, 23, 42, 0);
                imagettftext($badge, 44, 0, $textX, $textY, $textColor, $font, $label);
            }
        } else {
            $textColor = imagecolorallocatealpha($badge, 15, 23, 42, 0);
            imagestring($badge, 5, (int) ($size / 2) - 24, (int) ($size / 2) - 8, $label, $textColor);
        }

        imagecopy($image, $badge, $x, $y, 0, 0, $size, $size);
        imagedestroy($badge);
    }

    private static function draw_ttf_line(
        $image,
        string $text,
        string $font,
        float $size,
        int $x,
        int $topY,
        int $color,
        ?array $shadow = null,
        int $shadowOffset = 0
    ): int
    {
        if ($font === '' || !is_readable($font)) {
            return $topY;
        }
        $metrics = self::ttf_metrics($font, $size, $text);
        $baseline = $topY + $metrics['ascent'];

        if (is_array($shadow) && $shadowOffset !== 0) {
            $shadowColor = imagecolorallocatealpha(
                $image,
                $shadow[0] ?? 0,
                $shadow[1] ?? 0,
                $shadow[2] ?? 0,
                $shadow[3] ?? 80
            );
            @imagettftext(
                $image,
                $size,
                0,
                $x + $shadowOffset,
                $baseline + $shadowOffset,
                $shadowColor,
                $font,
                $text
            );
        }

        @imagettftext($image, $size, 0, $x, $baseline, $color, $font, $text);
        return $topY + $metrics['height'];
    }

    private static function ttf_metrics(string $font, float $size, string $text = 'Ag'): array
    {
        $bbox = @imagettfbbox($size, 0, $font, $text);
        if (!is_array($bbox)) {
            $fallback = max(1, (int) round($size * 1.2));
            return [
                'height'  => $fallback,
                'ascent'  => (int) round($fallback * 0.8),
                'descent' => (int) round($fallback * 0.2),
            ];
        }
        $ys = [$bbox[1], $bbox[3], $bbox[5], $bbox[7]];
        $top = min($ys);
        $bottom = max($ys);
        $height = max(1, (int) ceil($bottom - $top));
        $ascent = (int) ceil(abs($top));
        $descent = max(0, $height - $ascent);
        return [
            'height'  => $height,
            'ascent'  => $ascent,
            'descent' => $descent,
        ];
    }

    private static function line_gap(string $font, float $size): int
    {
        $metrics = self::ttf_metrics($font, $size);
        return max(6, (int) round($metrics['height'] * 0.25));
    }

    private static function insert_card_request(array $data): void
    {
        global $wpdb;
        $table = $wpdb->prefix . 'impactshop_card_requests';

        $wpdb->insert(
            $table,
            [
                'slug'            => $data['slug'],
                'requester_name'  => $data['name'],
                'requester_email' => $data['email'],
                'consent'         => (int) $data['consent'],
                'card_url'        => $data['card_url'],
                'card_path'       => $data['card_path'],
                'context'         => $data['context'],
            ],
            ['%s', '%s', '%s', '%d', '%s', '%s', '%s']
        );
    }

    private static function cache_control_header(): string
    {
        return sprintf(
            'public, max-age=%d, stale-while-revalidate=%d',
            self::CACHE_TTL,
            self::STALE_TTL
        );
    }

    private static function http_date(int $timestamp): string
    {
        return gmdate('D, d M Y H:i:s', $timestamp) . ' GMT';
    }
}

if (is_admin()) {
    ImpactShop_NGO_Card_Admin::bootstrap();
}

ImpactShop_NGO_Card_API::bootstrap();

function impactshop_register_ngo_status_shortcode(): void
{
    add_shortcode('impactshop_ngo_status', 'impactshop_render_ngo_status_shortcode');
}

impactshop_register_ngo_status_shortcode();
add_action('init', 'impactshop_register_ngo_status_shortcode');

function impactshop_render_ngo_status_shortcode($atts = [], $content = '')
{
    if (!class_exists('ImpactShop_NGO_Card_API')) {
        return '';
    }

    $slug = ImpactShop_NGO_Card_API::current_slug_from_request();
    $item = $slug !== '' ? ImpactShop_NGO_Card_API::get_card_item($slug) : null;

    if (!$item) {
        $previewMode = is_preview() || isset($_GET['preview']);
        if (!$previewMode) {
            $previewMode = (is_admin() || wp_doing_ajax()) && (isset($_GET['elementor-preview']) || isset($_POST['elementor-preview']));
        }
        if ($previewMode) {
            $sample = ImpactShop_NGO_Card_API::get_sample_card_item();
            if ($sample) {
                $slug = $sample['slug'];
                $item = $sample;
            }
        }
    }

    if (!$item) {
        return '';
    }

    $name = $item['name'] ?? impactshop_resolve_ngo_name($slug);
    $resetUrl = ImpactShop_NGO_Card_API::get_reset_url();
    if ($resetUrl === '') {
        return '';
    }

    $atts = shortcode_atts(
        [
            'wrapper_class'  => 'impact-ngo-status',
            'text_class'     => 'impact-ngo-current',
            'button_class'   => 'impact-ngo-reset',
            'notice_class'   => 'impact-ngo-help',
            'text_template'  => __('Jelenleg a %s ügyét támogatod.', 'impactshop'),
            'button_label'   => __('Más ügyet támogatok', 'impactshop'),
            'show_button'    => 'true',
        ],
        $atts,
        'impactshop_ngo_status'
    );

    $textTemplate = $atts['text_template'] ?: __('Jelenleg a %s ügyét támogatod.', 'impactshop');
    $textHtml     = sprintf($textTemplate, '<strong>' . esc_html($name) . '</strong>');
    $textHtml     = wp_kses_post($textHtml);

    $showButton = filter_var($atts['show_button'], FILTER_VALIDATE_BOOLEAN);
    $buttonHtml = '';
    if ($showButton && $atts['button_label'] !== '') {
        $buttonHtml = sprintf(
            '<a class="%s" href="%s">%s</a>',
            esc_attr(trim($atts['button_class'])),
            esc_url($resetUrl),
            esc_html($atts['button_label'])
        );
    }

    $wrapperClass = trim($atts['wrapper_class']);
    $textClass    = trim($atts['text_class']);
    $noticeClass  = trim($atts['notice_class']);

    $noticeHtml = '';
    if (!empty($_GET['missing_shop'])) {
        $noticeHtml = sprintf(
            '<span class="%s">%s</span>',
            esc_attr($noticeClass ?: 'impact-ngo-help'),
            esc_html__('Válassz egy webshopot a támogatás folytatásához.', 'impactshop')
        );
    }

    return sprintf(
        '<div class="%1$s"><p class="%2$s">%3$s</p>%4$s%5$s</div>',
        esc_attr($wrapperClass),
        esc_attr($textClass),
        $textHtml,
        $buttonHtml,
        $noticeHtml
    );
}

function impactshop_maybe_inject_ngo_status_block($content)
{
    if (is_admin() || wp_doing_ajax()) {
        return $content;
    }

    if (!class_exists('ImpactShop_NGO_Card_API')) {
        return $content;
    }

    if (function_exists('has_shortcode') && has_shortcode($content, 'impactshop_ngo_status')) {
        return $content;
    }

    if (isset($_GET['elementor-preview']) || isset($_POST['elementor-preview'])) {
        return $content;
    }
    if (defined('ELEMENTOR_VERSION')) {
        try {
            $elementor = \Elementor\Plugin::$instance;
            if ($elementor && isset($elementor->editor) && method_exists($elementor->editor, 'is_edit_mode') && $elementor->editor->is_edit_mode()) {
                return $content;
            }
        } catch (\Throwable $e) {
            // ignore detection failures; continue with fallback
        }
    }

    $slug = ImpactShop_NGO_Card_API::current_slug_from_request();
    if ($slug === '') {
        return $content;
    }

    $block = do_shortcode('[impactshop_ngo_status]');
    if ($block === '') {
        return $content;
    }

    if (!in_the_loop() || !is_main_query()) {
        return $content;
    }

    return $block . $content;
}

add_filter('the_content', 'impactshop_maybe_inject_ngo_status_block', 15);

function impactshop_output_ngo_status_styles()
{
    if (is_admin()) {
        return;
    }
    static $printed = false;
    if ($printed) {
        return;
    }
    $printed = true;
    ?>
    <style id="impact-ngo-status-style">
      .impact-ngo-status {
        display:flex;
        flex-wrap:wrap;
        gap:1rem;
        align-items:center;
        justify-content:space-between;
        padding:1rem 1.5rem;
        border-radius:18px;
        background:rgba(15,23,42,0.75);
        color:#e2e8f0;
        border:1px solid rgba(148,163,184,0.35);
        box-shadow:0 20px 40px rgba(15,23,42,0.25);
        backdrop-filter:blur(14px);
        -webkit-backdrop-filter:blur(14px);
      }
      .impact-ngo-status .impact-ngo-current {
        margin:0;
        font-size:0.95rem;
        color:rgba(226,232,240,0.95);
      }
      .impact-ngo-status .impact-ngo-current strong {
        color:#f8fafc;
      }
      .impact-ngo-status .impact-ngo-reset {
        display:inline-flex;
        align-items:center;
        justify-content:center;
        padding:0.55rem 1.25rem;
        border-radius:999px;
        border:1px solid rgba(148,163,184,0.45);
        color:#e2e8f0;
        text-decoration:none;
        font-weight:600;
        font-size:0.9rem;
        background:rgba(15,23,42,0.6);
        box-shadow:0 10px 22px rgba(15,23,42,0.25);
        transition:all 0.2s ease;
      }
      .impact-ngo-status .impact-ngo-reset:hover,
      .impact-ngo-status .impact-ngo-reset:focus-visible {
        border-color:rgba(56,189,248,0.8);
        color:#f0f9ff;
        box-shadow:0 14px 28px rgba(56,189,248,0.25);
        transform:translateY(-1px);
        outline:none;
      }
      .impact-ngo-status .impact-ngo-help {
        display:block;
        font-size:0.8rem;
        color:rgba(248,250,252,0.75);
        margin-top:0.35rem;
      }
    </style>
    <?php
}

add_action('wp_head', 'impactshop_output_ngo_status_styles');

if (!function_exists('impactshop_get_huf_rate')) {
    /**
     * Fallback exchange rate helper (staging/dev safety).
     */
    function impactshop_get_huf_rate()
    {
        if (defined('IMPACTSHOP_FX_HUF')) {
            return (float) IMPACTSHOP_FX_HUF;
        }
        if (defined('IMPACT_SUM_RATE_HUF')) {
            return (float) IMPACT_SUM_RATE_HUF;
        }
        return 392.0;
    }
}

if (!function_exists('impactshop_format_huf')) {
    function impactshop_format_huf($value)
    {
        return number_format((float) $value, 0, '.', ' ') . ' Ft';
    }
}

if (!function_exists('impactshop_resolve_ngo_name')) {
    function impactshop_resolve_ngo_name(string $slug): string
    {
        return ucwords(str_replace('-', ' ', $slug));
    }
}
