#!/usr/bin/env sh

connector_install_skill()
{
    skill_directory="$1"
    temp_home="$2"
    # installs a skill for the connector
    # prints out all installed files, each on a new line
    :
}

connector_install_sub_agent()
{
    sub_agent_file="$1"
    temp_home="$2"
    # installs a sub agent for the connector
    # prints out all installed files, each on a new line
    :
}

connector_install_global_instruction()
{
    global_instruction_file="$1"
    temp_home="$2"
    # installs a global instruction for the connector
    # prints out all installed files, each on a new line
    :
}

connector_load_available()
{
    # returns all available connectors, one per line
    connectors_directory="$_CR_INSTALL_DIR/connectors"
    :
}