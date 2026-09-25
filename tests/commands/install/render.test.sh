#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../../.." && pwd)

. "$PROJECT_ROOT/tests/suite.sh"

_render()
(
    . "$PROJECT_ROOT/lib/commands/install/render.sh"
    harness_render "$@"
)

_fixture()
{
    fixture_root=$1
    mkdir -p "$fixture_root/bundle/instructions/skills/example/nested" \
        "$fixture_root/bundle/instructions/skills/empty" \
        "$fixture_root/bundle/instructions/skills/absent" \
        "$fixture_root/bundle/instructions/agents" "$fixture_root/stage"
    printf 'use <skill>example</skill> and <skill>broken name</skill>\n' \
        > "$fixture_root/bundle/instructions/AGENTS.md"
    printf '%s\n' '---' 'name: example' 'description: Example skill' \
        'disable-model-invocation: true' 'extra: retained' '---' \
        'Use <skill>other</skill>.' 'disable-model-invocation: body text' \
        > "$fixture_root/bundle/instructions/skills/example/SKILL.md"
    printf 'nested <skill>example</skill>\n' \
        > "$fixture_root/bundle/instructions/skills/example/nested/guide.md"
    printf '<skill>example</skill>\000bytes\n' \
        > "$fixture_root/bundle/instructions/skills/example/.asset"
    printf '#!/usr/bin/env sh\nprintf helper\n' \
        > "$fixture_root/bundle/instructions/skills/example/helper.sh"
    chmod 755 "$fixture_root/bundle/instructions/skills/example/helper.sh"
    printf '%s\n' '---' 'name: empty' 'description: Empty skill' \
        'disable-model-invocation: false' '---' \
        > "$fixture_root/bundle/instructions/skills/empty/SKILL.md"
    printf '%s\n' '---' 'name: absent' 'description: Absent policy skill' '---' \
        > "$fixture_root/bundle/instructions/skills/absent/SKILL.md"
    printf '%s\n' '---' "name: 'Agent ''quote'' \\ slash'" \
        'description: "Line\nquote \" slash \\ tab\t"' '---' \
        > "$fixture_root/bundle/instructions/agents/quoted.md"
    printf 'body <skill>example</skill> """\t\\ end\n' \
        >> "$fixture_root/bundle/instructions/agents/quoted.md"
    printf '%s\n' '---' 'name: plain' 'description: Plain agent' '---' \
        > "$fixture_root/bundle/instructions/agents/plain.md"
    printf 'no final newline <skill>example</skill>' \
        >> "$fixture_root/bundle/instructions/agents/plain.md"
}

_test_harness_output()
(
    fixture_root=$(mktemp -d) || exit 1
    trap 'rm -rf "$fixture_root"' 0 HUP INT TERM
    _fixture "$fixture_root"

    _render codex "$fixture_root/bundle" "$fixture_root/stage" || exit 1
    cmp "$fixture_root/bundle/instructions/skills/example/.asset" \
        "$fixture_root/stage/skills/example/.asset" || exit 1
    [ -x "$fixture_root/stage/skills/example/helper.sh" ] || exit 1
    grep -Fqx 'use $example and <skill>broken name</skill>' "$fixture_root/stage/AGENTS.md" || exit 1
    grep -Fqx 'Use $other.' "$fixture_root/stage/skills/example/SKILL.md" || exit 1
    grep -Fqx 'extra: retained' "$fixture_root/stage/skills/example/SKILL.md" || exit 1
    grep -Fqx 'disable-model-invocation: body text' "$fixture_root/stage/skills/example/SKILL.md" || exit 1
    ! grep -Fqx 'disable-model-invocation: true' "$fixture_root/stage/skills/example/SKILL.md" || exit 1
    ! grep -Fqx 'disable-model-invocation: false' "$fixture_root/stage/skills/empty/SKILL.md" || exit 1
    printf '%s\n' 'policy:' '  allow_implicit_invocation: false' > "$fixture_root/expected-openai.yaml"
    cmp "$fixture_root/expected-openai.yaml" "$fixture_root/stage/skills/example/agents/openai.yaml" || exit 1
    [ ! -e "$fixture_root/stage/skills/empty/agents/openai.yaml" ] || exit 1
    [ ! -e "$fixture_root/stage/skills/absent/agents/openai.yaml" ] || exit 1
    grep -Fqx 'nested $example' "$fixture_root/stage/skills/example/nested/guide.md" || exit 1
    [ -f "$fixture_root/stage/skills/empty/SKILL.md" ] || exit 1
    printf '%s\n' 'name = "Agent '\''quote'\'' \\ slash"' \
        'description = "Line\nquote \" slash \\ tab\t"' \
        'developer_instructions = """body $example \"\"\"\t\\ end\n"""' \
        > "$fixture_root/expected-quoted.toml"
    cmp "$fixture_root/expected-quoted.toml" "$fixture_root/stage/agents/quoted.toml" || exit 1
    printf '%s\n' 'name = "plain"' 'description = "Plain agent"' \
        'developer_instructions = """no final newline $example"""' \
        > "$fixture_root/expected-plain.toml"
    cmp "$fixture_root/expected-plain.toml" "$fixture_root/stage/agents/plain.toml" || exit 1

    for harness_and_file in 'claude CLAUDE.md' 'copilot copilot-instructions.md' 'gemini GEMINI.md'; do
        set -- $harness_and_file
        rm -rf "$fixture_root/stage"
        mkdir "$fixture_root/stage"
        _render "$1" "$fixture_root/bundle" "$fixture_root/stage" || exit 1
        grep -Fqx 'use /example and <skill>broken name</skill>' "$fixture_root/stage/$2" || exit 1
        printf '%s\n' '---' 'name: example' 'description: Example skill' \
            'disable-model-invocation: true' 'extra: retained' '---' \
            'Use /other.' 'disable-model-invocation: body text' \
            > "$fixture_root/expected-skill.md"
        cmp "$fixture_root/expected-skill.md" "$fixture_root/stage/skills/example/SKILL.md" || exit 1
        grep -Fqx 'disable-model-invocation: true' "$fixture_root/stage/skills/example/SKILL.md" || exit 1
        grep -Fqx 'disable-model-invocation: false' "$fixture_root/stage/skills/empty/SKILL.md" || exit 1
        case "$1" in
            copilot) agent_suffix=.agent.md ;;
            *) agent_suffix=.md ;;
        esac
        grep -Fq 'body /example' "$fixture_root/stage/agents/quoted$agent_suffix" || exit 1
        printf '%s\n' '---' 'name: plain' 'description: Plain agent' '---' \
            > "$fixture_root/expected-plain.md"
        printf 'no final newline /example' >> "$fixture_root/expected-plain.md"
        cmp "$fixture_root/expected-plain.md" \
            "$fixture_root/stage/agents/plain$agent_suffix" || exit 1
    done
)

_test_repeatable_output()
(
    fixture_root=$(mktemp -d) || exit 1
    trap 'rm -rf "$fixture_root"' 0 HUP INT TERM
    _fixture "$fixture_root"
    mkdir "$fixture_root/second"
    _render claude "$fixture_root/bundle" "$fixture_root/stage" || exit 1
    _render claude "$fixture_root/bundle" "$fixture_root/second" || exit 1
    diff -r "$fixture_root/stage" "$fixture_root/second"
)

_test_empty_agent_and_skill_directories()
(
    fixture_root=$(mktemp -d) || exit 1
    trap 'rm -rf "$fixture_root"' 0 HUP INT TERM
    _fixture "$fixture_root"
    rm -rf "$fixture_root/bundle/instructions/skills" "$fixture_root/bundle/instructions/agents"
    mkdir "$fixture_root/bundle/instructions/skills" "$fixture_root/bundle/instructions/agents"
    _render gemini "$fixture_root/bundle" "$fixture_root/stage" || exit 1
    [ -f "$fixture_root/stage/GEMINI.md" ] || exit 1
    [ ! -e "$fixture_root/stage/skills" ] || exit 1
    [ ! -e "$fixture_root/stage/agents" ] || exit 1
)

_test_rejects_invalid_agents()
(
    fixture_root=$(mktemp -d) || exit 1
    trap 'rm -rf "$fixture_root"' 0 HUP INT TERM
    _fixture "$fixture_root"
    printf '%s\n' '---' 'name: bad' 'description: Bad' 'model: inferred' '---' \
        > "$fixture_root/bundle/instructions/agents/plain.md"
    ! _render codex "$fixture_root/bundle" "$fixture_root/stage" || exit 1

    rm -rf "$fixture_root/stage"
    mkdir "$fixture_root/stage"
    printf '%s\n' '---' 'name: bad' 'name: duplicate' 'description: Bad' '---' \
        > "$fixture_root/bundle/instructions/agents/plain.md"
    ! _render claude "$fixture_root/bundle" "$fixture_root/stage" || exit 1

    rm -rf "$fixture_root/stage"
    mkdir "$fixture_root/stage"
    printf '%s\n' '---' 'name: bad' 'description: "bad\q"' '---' \
        > "$fixture_root/bundle/instructions/agents/plain.md"
    ! _render copilot "$fixture_root/bundle" "$fixture_root/stage" || exit 1

    rm -rf "$fixture_root/stage"
    mkdir "$fixture_root/stage"
    printf '%s\n' '---' "name: 'Agent ''quote'' \\ slash'" 'description: Duplicate name' '---' \
        > "$fixture_root/bundle/instructions/agents/plain.md"
    ! _render gemini "$fixture_root/bundle" "$fixture_root/stage" || exit 1

    rm -rf "$fixture_root/stage"
    mkdir "$fixture_root/stage"
    mv "$fixture_root/bundle/instructions/agents/plain.md" \
        "$fixture_root/bundle/instructions/agents/unsafe.name.md"
    ! _render codex "$fixture_root/bundle" "$fixture_root/stage" || exit 1

    rm -rf "$fixture_root/stage"
    mkdir "$fixture_root/stage"
    ln -s quoted.md "$fixture_root/bundle/instructions/agents/linked.md"
    ! _render codex "$fixture_root/bundle" "$fixture_root/stage" || exit 1
)

_test_invalid_sources_do_not_write_destination()
(
    fixture_root=$(mktemp -d) || exit 1
    trap 'rm -rf "$fixture_root"' 0 HUP INT TERM
    _fixture "$fixture_root"
    printf 'installed\n' > "$fixture_root/installed"

    rm "$fixture_root/bundle/instructions/skills/example/SKILL.md"
    ! _render codex "$fixture_root/bundle" "$fixture_root/stage" || exit 1
    cmp "$fixture_root/installed" "$fixture_root/installed" || exit 1
    [ ! -e "$fixture_root/stage/AGENTS.md" ] || exit 1
)

_test_rejects_invalid_inputs()
(
    fixture_root=$(mktemp -d) || exit 1
    trap 'rm -rf "$fixture_root"' 0 HUP INT TERM
    _fixture "$fixture_root"
    ! _render unknown "$fixture_root/bundle" "$fixture_root/stage" || exit 1
    ! _render codex "$fixture_root/bundle" "$fixture_root/not-empty" || exit 1
    mkdir "$fixture_root/not-empty"
    : > "$fixture_root/not-empty/file"
    ! _render codex "$fixture_root/bundle" "$fixture_root/not-empty" || exit 1
    ln -s AGENTS.md "$fixture_root/bundle/instructions/linked"
    ! _render codex "$fixture_root/bundle" "$fixture_root/stage" || exit 1
)

_test_rejects_invalid_skill_metadata_and_entries()
(
    fixture_root=$(mktemp -d) || exit 1
    trap 'rm -rf "$fixture_root"' 0 HUP INT TERM
    _fixture "$fixture_root"
    mv "$fixture_root/bundle/instructions/skills/example" "$fixture_root/bundle/instructions/skills/bad.name"
    mkdir "$fixture_root/first-stage"
    ! _render codex "$fixture_root/bundle" "$fixture_root/first-stage" || exit 1

    rm -rf "$fixture_root/bundle/instructions/skills/bad.name"
    mkdir "$fixture_root/bundle/instructions/skills/example"
    printf '%s\n' '---' 'name: wrong' 'description: Example skill' '---' \
        > "$fixture_root/bundle/instructions/skills/example/SKILL.md"
    mkdir "$fixture_root/second-stage"
    ! _render codex "$fixture_root/bundle" "$fixture_root/second-stage" || exit 1

    printf '%s\n' '---' 'name: example' 'description: Example skill' 'description: Duplicate' '---' \
        > "$fixture_root/bundle/instructions/skills/example/SKILL.md"
    mkdir "$fixture_root/third-stage"
    ! _render codex "$fixture_root/bundle" "$fixture_root/third-stage" || exit 1

    printf '%s\n' '---' 'name: example' 'description: Example skill' \
        'disable-model-invocation: sometimes' '---' > "$fixture_root/bundle/instructions/skills/example/SKILL.md"
    mkdir "$fixture_root/policy-stage"
    ! _render codex "$fixture_root/bundle" "$fixture_root/policy-stage" || exit 1

    printf '%s\n' '---' 'name: example' 'description: Example skill' \
        'disable-model-invocation: true' 'disable-model-invocation: false' '---' \
        > "$fixture_root/bundle/instructions/skills/example/SKILL.md"
    mkdir "$fixture_root/duplicate-policy-stage"
    ! _render codex "$fixture_root/bundle" "$fixture_root/duplicate-policy-stage" || exit 1

    printf '%s\n' '---' 'name: example' 'description: Example skill' '---' \
        > "$fixture_root/bundle/instructions/skills/example/SKILL.md"
    mkdir -p "$fixture_root/bundle/instructions/skills/example/agents"
    : > "$fixture_root/bundle/instructions/skills/example/agents/openai.yaml"
    mkdir "$fixture_root/collision-stage"
    ! _render codex "$fixture_root/bundle" "$fixture_root/collision-stage" || exit 1
    mkdir "$fixture_root/collision-claude-stage"
    _render claude "$fixture_root/bundle" "$fixture_root/collision-claude-stage" || exit 1

    rm "$fixture_root/bundle/instructions/skills/example/SKILL.md"
    mkfifo "$fixture_root/bundle/instructions/skills/example/pipe"
    mkdir "$fixture_root/fourth-stage"
    ! _render codex "$fixture_root/bundle" "$fixture_root/fourth-stage" || exit 1
)

_test_staging_write_failure()
(
    fixture_root=$(mktemp -d) || exit 1
    trap 'rm -rf "$fixture_root"' 0 HUP INT TERM
    _fixture "$fixture_root"
    (
        . "$PROJECT_ROOT/lib/commands/install/render.sh"
        cp()
        {
            return 1
        }
        ! harness_render codex "$fixture_root/bundle" "$fixture_root/stage"
    ) || exit 1
    [ ! -e "$fixture_root/installed" ] || exit 1
)

print_tests_header 'Install renderer'
test 'renders all global filenames and skill trees' _test_harness_output
test 'renders repeatable output' _test_repeatable_output
test 'accepts empty agent and skill directories' _test_empty_agent_and_skill_directories
test 'rejects missing required sources without installed writes' _test_invalid_sources_do_not_write_destination
test 'rejects invalid harnesses, stages, and source links' _test_rejects_invalid_inputs
test 'rejects invalid skill metadata and special entries' _test_rejects_invalid_skill_metadata_and_entries
test 'rejects invalid agent metadata, names, and links' _test_rejects_invalid_agents
test 'reports staging write failures' _test_staging_write_failure
print_tests_summary
some_tests_failed && exit 1
