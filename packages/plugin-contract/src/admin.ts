/**
 * Where a plugin-owned collection sits in the admin sidebar.
 *
 * A string (or a map of locale to string, as Payload accepts) names the
 * group. `false` leaves the collection ungrouped, in Payload's default
 * "Collections" section — which is not what `false` means on a collection's
 * own `admin.group`: there Payload reads it as "leave out of the nav
 * entirely". A plugin translates this value; it never passes `false` through.
 */
export type PluginAdminGroup = string | Record<string, string> | false

/**
 * Admin options accepted by every Throughline plugin that declares a
 * collection. Plugins that declare none do not accept it, for the same reason
 * a plugin with no endpoints omits `routePrefix`: an option it cannot honour
 * would be a silent no-op.
 */
export interface PluginAdminOptions {
  /**
   * Sidebar group for every collection the plugin declares. Defaults to
   * {@link DEFAULT_ADMIN_GROUP}. `false` leaves them ungrouped.
   *
   * Payload renders an ungrouped collection loose at the top of the sidebar,
   * above every group — which is why the default is a group and not nothing.
   */
  group?: PluginAdminGroup
}

/**
 * The options a collection-declaring plugin adds to its own. Kept apart from
 * `BaseCorePluginOptions` so that only those plugins carry it.
 */
export interface CollectionPluginOptions {
  /** Admin UI placement for the collections this plugin declares. */
  admin?: PluginAdminOptions
}

/** The sidebar group plugin-owned collections land in when no group is given. */
export const DEFAULT_ADMIN_GROUP = 'Throughline'

/**
 * Resolves a plugin's `admin` option to the fragment it spreads into each
 * collection's `admin` block: `{ group }` for a named group, `{}` for
 * ungrouped. Never returns `group: false`, which Payload would read as hidden.
 */
export function resolveAdminGroup(admin?: PluginAdminOptions): {
  group?: string | Record<string, string>
} {
  const group = admin?.group ?? DEFAULT_ADMIN_GROUP
  return group === false ? {} : { group }
}
