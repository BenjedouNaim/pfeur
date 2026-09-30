// setup.js - Discord server setup (discord.js v14)
//
// Usage:
//   node setup.js --dry      Show the plan, change NOTHING
//   node setup.js            Create / update everything, delete NOTHING
//   node setup.js --clean    Same as above, then DELETE every channel/role not in CONFIG
//
// .env needed:
//   DISCORD_TOKEN=...
//   GUILD_ID=...
//   ADMIN_USER_IDS=111,222     (optional: users who get the Admin role)

require('dotenv').config();
const {
    Client, Events, GatewayIntentBits, ChannelType,
    GuildVerificationLevel, GuildExplicitContentFilter, GuildDefaultMessageNotifications,
    AutoModerationRuleTriggerType, AutoModerationRuleEventType,
    AutoModerationRuleKeywordPresetType, AutoModerationActionType, EmbedBuilder,
} = require('discord.js');

const DRY = process.argv.includes('--dry');
const CLEAN = process.argv.includes('--clean');
const REASON = 'Server setup script';

// ---------------------------------------------------------------------------
// CONFIG - edit names / texts here, the logic below never needs to change
// ---------------------------------------------------------------------------
const CONFIG = {
    roles: [
        { key: 'admin', name: 'Admin', color: 0xe74c3c, hoist: true, permissions: ['Administrator'] },
        { key: 'male', name: 'Male', color: 0x3498db, hoist: false, permissions: [] },
        { key: 'female', name: 'Female', color: 0xe91e63, hoist: false, permissions: [] },
    ],

    // access: 'public' (everyone) | 'male' | 'female' (only that role can see it)
    // readonly: true => only Admin can post
    categories: [
        {
            name: '📌・START HERE', access: 'public', channels: [
                { key: 'welcome', name: '👋・welcome', type: 'text', readonly: true },
                { key: 'rules', name: '📜・rules', type: 'text', readonly: true },
                { key: 'announcements', name: '📢・announcements', type: 'text', readonly: true },
            ]
        },
        {
            name: '💼・OPPORTUNITIES', access: 'public', channels: [
                { key: 'internships', name: '💼・internships', type: 'text', readonly: true },
            ]
        },
        {
            name: '🎓・CERTIFICATIONS', access: 'public', channels: [
                { key: 'certs', name: '🎓・certification-links', type: 'text', readonly: true },
            ]
        },
        {
            name: '🚀・PROJECTS', access: 'public', channels: [
                { key: 'projects', name: '🚀・useful-projects', type: 'text', readonly: true },
                { key: 'share', name: '🛠️・share-your-project', type: 'text', readonly: false },
            ]
        },
        {
            name: '💬・GENERAL', access: 'public', channels: [
                { key: 'general', name: '💬・general-chat', type: 'text', readonly: false },
                { key: 'introductions', name: '🙋・introductions', type: 'text', readonly: false },
                { key: 'offtopic', name: '🎲・off-topic', type: 'text', readonly: false },
                { key: 'gv1', name: '🔊 General Voice 1', type: 'voice', readonly: false },
                { key: 'gv2', name: '🔊 General Voice 2', type: 'voice', readonly: false },
            ]
        },
        {
            name: '👥・MIXED', access: 'public', channels: [
                { key: 'mixed', name: '👥・mixed-chat', type: 'text', readonly: false },
                { key: 'mixedv', name: '🔊 Mixed Voice', type: 'voice', readonly: false },
            ]
        },
        {
            name: '👨・MALE', access: 'male', channels: [
                { key: 'malechat', name: '👨・male-chat', type: 'text', readonly: false },
                { key: 'malevoice', name: '🔊 Male Voice', type: 'voice', readonly: false },
            ]
        },
        {
            name: '👩・FEMALE', access: 'female', channels: [
                { key: 'femalechat', name: '👩・female-chat', type: 'text', readonly: false },
                { key: 'femalevoice', name: '🔊 Female Voice', type: 'voice', readonly: false },
            ]
        },
    ],

    welcomeText:
        'Welcome! This community shares internship opportunities, certifications and useful projects.\n\n' +
        '**Where to go**\n' +
        '• Opportunities, certifications and projects are posted by the admin team.\n' +
        '• Chat in General or Mixed. Male / Female rooms unlock when you pick your role in **Channels & Roles**.\n' +
        '• Read the rules before posting.',

    rulesText:
        '**1.** Be respectful. No harassment, hate speech or discrimination.\n' +
        '**2.** No spam, self-promotion or unsolicited DMs.\n' +
        '**3.** Keep every channel on topic.\n' +
        '**4.** Respect the privacy of the Male / Female rooms. Nothing said there leaves there.\n' +
        '**5.** Do not share personal information (yours or others).\n' +
        '**6.** Follow Discord Terms of Service and Community Guidelines.\n' +
        '**7.** Admins have the final word. Report problems to an Admin.',
};

// Permissions for @everyone (least privilege: no mention-everyone, no manage-anything)
const EVERYONE_PERMS = [
    'ViewChannel', 'ReadMessageHistory', 'SendMessages', 'SendMessagesInThreads',
    'AddReactions', 'EmbedLinks', 'AttachFiles', 'UseExternalEmojis',
    'Connect', 'Speak', 'UseVAD', 'Stream', 'ChangeNickname', 'CreateInstantInvite',
];

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const TYPE = { text: ChannelType.GuildText, voice: ChannelType.GuildVoice };
const norm = (s) => s.toLowerCase().replace(/\s+/g, '-');
const log = (...a) => console.log(...a);
const warn = (...a) => console.warn('  ⚠️ ', ...a);
const findChannel = (guild, name, type) =>
    guild.channels.cache.find((c) => c.type === type && norm(c.name) === norm(name));
const findRole = (guild, name) =>
    guild.roles.cache.find((r) => r.name === name && !r.managed);

let seq = 0n;
const fakeId = () => String(((BigInt(Date.now()) - 1420070400000n) << 22n) + seq++);

// ---------------------------------------------------------------------------
// dry run: print the plan only
// ---------------------------------------------------------------------------
function printPlan(guild) {
    const ok = (x) => (x ? 'exists (will be updated)' : 'will be CREATED');
    log('\n=== ROLES ===');
    for (const r of CONFIG.roles) log(`  ${r.name}: ${ok(findRole(guild, r.name))}`);

    log('\n=== CHANNELS ===');
    const keepCh = new Set();
    for (const cat of CONFIG.categories) {
        const c = findChannel(guild, cat.name, ChannelType.GuildCategory);
        if (c) keepCh.add(c.id);
        log(`  ${cat.name}: ${ok(c)}`);
        for (const ch of cat.channels) {
            const e = findChannel(guild, ch.name, TYPE[ch.type]);
            if (e) keepCh.add(e.id);
            log(`     ${ch.name}: ${ok(e)}`);
        }
    }

    if (CLEAN) {
        const keepNames = new Set(CONFIG.roles.map((r) => r.name));
        log('\n=== WOULD DELETE (channels) ===');
        const dc = guild.channels.cache.filter((c) => !keepCh.has(c.id));
        dc.forEach((c) => log(`  - ${c.name}`));
        if (!dc.size) log('  (none)');
        log('\n=== WOULD DELETE (roles) ===');
        const dr = guild.roles.cache.filter(
            (r) => !r.managed && r.id !== guild.id && !keepNames.has(r.name));
        dr.forEach((r) => log(`  - ${r.name}${r.editable ? '' : '  (cannot: above the bot role)'}`));
        if (!dr.size) log('  (none)');
    } else {
        log('\n(no --clean flag: existing template channels/roles would be left untouched)');
    }
    log('\nDry run only. Nothing was changed.');
}

// ---------------------------------------------------------------------------
// real run
// ---------------------------------------------------------------------------
async function run(client) {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    await guild.roles.fetch();
    await guild.channels.fetch();
    log(`Connected to server: ${guild.name}`);

    if (DRY) return printPlan(guild);

    // ---- 1. roles ----------------------------------------------------------
    log('\n[1/7] Roles');
    const roles = {};
    for (const r of CONFIG.roles) {
        let role = findRole(guild, r.name);
        const data = {
            name: r.name, color: r.color, hoist: r.hoist, mentionable: false,
            permissions: r.permissions, reason: REASON
        };
        if (!role) { role = await guild.roles.create(data); log(`  + created role ${r.name}`); }
        else if (role.editable) { await role.edit(data); log(`  ~ updated role ${r.name}`); }
        else warn(`role ${r.name} is above the bot role - drag the bot role to the TOP and re-run`);
        roles[r.key] = role;
    }
    await guild.roles.everyone.setPermissions(EVERYONE_PERMS, REASON);
    log('  ~ @everyone permissions reduced to safe defaults');

    // ---- 2. categories + channels -----------------------------------------
    log('\n[2/7] Categories and channels');
    const everyoneId = guild.roles.everyone.id;

    const overwritesFor = (access, readonly) => {
        if (access === 'male' || access === 'female') {
            return [
                { id: everyoneId, deny: ['ViewChannel'] },
                {
                    id: roles[access].id,
                    allow: ['ViewChannel', 'ReadMessageHistory', 'SendMessages', 'Connect', 'Speak']
                },
            ];
        }
        if (readonly) {
            return [
                {
                    id: everyoneId,
                    deny: ['SendMessages', 'CreatePublicThreads', 'CreatePrivateThreads', 'SendMessagesInThreads']
                },
                { id: roles.admin.id, allow: ['SendMessages'] },
            ];
        }
        return [];
    };

    const ensure = async (name, type, parent, overwrites) => {
        const existing = findChannel(guild, name, type);
        if (existing) {
            const patch = { permissionOverwrites: overwrites, reason: REASON };
            if (parent) patch.parent = parent.id;
            await existing.edit(patch);
            log(`  ~ updated ${name}`);
            return existing;
        }
        const created = await guild.channels.create({
            name, type, parent: parent ? parent.id : undefined,
            permissionOverwrites: overwrites, reason: REASON,
        });
        log(`  + created ${name}`);
        return created;
    };

    const ch = {};            // key -> channel
    const keepCh = new Set(); // ids never to delete
    const defaultChannelIds = [];
    for (const cat of CONFIG.categories) {
        const category = await ensure(cat.name, ChannelType.GuildCategory, null, overwritesFor(cat.access, false));
        keepCh.add(category.id);
        for (const def of cat.channels) {
            const c = await ensure(def.name, TYPE[def.type], category, overwritesFor(cat.access, def.readonly));
            ch[def.key] = c;
            keepCh.add(c.id);
            if (cat.access === 'public' && def.type === 'text') defaultChannelIds.push(c.id);
        }
    }

    // ---- 3. admins ---------------------------------------------------------
    const adminIds = (process.env.ADMIN_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
    for (const id of adminIds) {
        try {
            const m = await guild.members.fetch(id);
            await m.roles.add(roles.admin, REASON);
            log(`  + Admin role given to ${m.user.tag}`);
        } catch (e) { warn(`could not give Admin role to ${id}: ${e.message}`); }
    }

    // ---- 4. server security + community -----------------------------------
    log('\n[3/7] Server security settings and Community mode');
    try {
        const settings = {
            verificationLevel: GuildVerificationLevel.Medium,
            explicitContentFilter: GuildExplicitContentFilter.AllMembers,
            defaultMessageNotifications: GuildDefaultMessageNotifications.OnlyMentions,
            systemChannel: ch.general.id,
            rulesChannel: ch.rules.id,
            publicUpdatesChannel: ch.announcements.id,
            reason: REASON,
        };
        if (!guild.features.includes('COMMUNITY')) settings.features = [...guild.features, 'COMMUNITY'];
        await guild.edit(settings);
        log('  ~ verification: Medium, content filter: all members, notifications: mentions only');
        log('  ~ Community mode on, rules + updates channels set');
    } catch (e) {
        warn(`could not apply server settings / Community mode: ${e.message}`);
        warn('-> do it manually: Server Settings > Enable Community (see the manual checklist)');
    }

    // ---- 5. welcome + rules messages --------------------------------------
    log('\n[4/7] Welcome and rules messages');
    const seed = async (channel, embed) => {
        const msgs = await channel.messages.fetch({ limit: 1 });
        if (msgs.size === 0) { await channel.send({ embeds: [embed] }); log(`  + posted in ${channel.name}`); }
        else log(`  = ${channel.name} already has a message, skipped`);
    };
    try {
        await seed(ch.welcome, new EmbedBuilder().setTitle('👋 Welcome').setDescription(CONFIG.welcomeText).setColor(0x5865f2));
        await seed(ch.rules, new EmbedBuilder().setTitle('📜 Server Rules').setDescription(CONFIG.rulesText).setColor(0xed4245));
    } catch (e) { warn(`could not post messages: ${e.message}`); }

    // ---- 6. AutoMod --------------------------------------------------------
    log('\n[5/7] AutoMod');
    try {
        const existing = await guild.autoModerationRules.fetch();
        const has = (n) => existing.some((r) => r.name === n);
        const common = {
            eventType: AutoModerationRuleEventType.MessageSend,
            actions: [{ type: AutoModerationActionType.BlockMessage }],
            enabled: true, exemptRoles: [roles.admin.id], reason: REASON,
        };
        if (!has('Block mention spam')) {
            await guild.autoModerationRules.create({
                ...common, name: 'Block mention spam',
                triggerType: AutoModerationRuleTriggerType.MentionSpam,
                triggerMetadata: { mentionTotalLimit: 5 },
            });
            log('  + rule: block mention spam');
        }
        if (!has('Block profanity and slurs')) {
            await guild.autoModerationRules.create({
                ...common, name: 'Block profanity and slurs',
                triggerType: AutoModerationRuleTriggerType.KeywordPreset,
                triggerMetadata: {
                    presets: [
                        AutoModerationRuleKeywordPresetType.Profanity,
                        AutoModerationRuleKeywordPresetType.SexualContent,
                        AutoModerationRuleKeywordPresetType.Slurs,
                    ]
                },
            });
            log('  + rule: block profanity / sexual content / slurs');
        }
    } catch (e) { warn(`AutoMod failed: ${e.message}`); }

    // ---- 7. onboarding -----------------------------------------------------
    log('\n[6/7] Onboarding');
    try {
        const body = {
            enabled: true,
            mode: 0,
            default_channel_ids: defaultChannelIds,
            prompts: [{
                id: fakeId(),
                title: 'Which rooms do you want access to?',
                single_select: true,
                required: false,
                in_onboarding: true,
                type: 0,
                options: [
                    {
                        id: fakeId(), title: 'Male', description: 'Unlocks the Male rooms',
                        emoji_name: '👨', role_ids: [roles.male.id], channel_ids: []
                    },
                    {
                        id: fakeId(), title: 'Female', description: 'Unlocks the Female rooms',
                        emoji_name: '👩', role_ids: [roles.female.id], channel_ids: []
                    },
                ],
            }],
        };
        await client.rest.put(`/guilds/${guild.id}/onboarding`, { body });
        log('  ~ onboarding enabled with the Male / Female question');
    } catch (e) {
        warn(`onboarding could not be set by the script: ${e.message}`);
        warn('-> set it up manually: Server Settings > Onboarding (see the manual checklist)');
    }

    // ---- 8. cleanup --------------------------------------------------------
    log('\n[7/7] Cleanup');
    if (!CLEAN) {
        log('  skipped (run with --clean to delete channels/roles that are not in CONFIG)');
    } else {
        const keepNames = new Set(CONFIG.roles.map((r) => r.name));
        for (const c of [...guild.channels.cache.values()]) {
            if (keepCh.has(c.id)) continue;
            try { await c.delete(REASON); log(`  - deleted channel ${c.name}`); }
            catch (e) { warn(`could not delete channel ${c.name}: ${e.message}`); }
        }
        for (const r of [...guild.roles.cache.values()]) {
            if (r.managed || r.id === guild.id || keepNames.has(r.name)) continue;
            if (!r.editable) { warn(`cannot delete role ${r.name} (above the bot role) - delete it manually`); continue; }
            try { await r.delete(REASON); log(`  - deleted role ${r.name}`); }
            catch (e) { warn(`could not delete role ${r.name}: ${e.message}`); }
        }
    }

    log('\nDone. Now go through the manual checklist.');
}

// ---------------------------------------------------------------------------
// start
// ---------------------------------------------------------------------------
if (!process.env.DISCORD_TOKEN || !process.env.GUILD_ID) {
    console.error('Missing DISCORD_TOKEN or GUILD_ID in .env');
    process.exit(1);
}
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.once(Events.ClientReady, async () => {
    try { await run(client); }
    catch (e) { console.error('Fatal error:', e); }
    finally { client.destroy(); }
});
client.login(process.env.DISCORD_TOKEN);