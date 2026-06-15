#!/usr/bin/env sh

TEST_INDEX=0

assert_equal() {
    expected=$1
    actual=$2

    if [ "$actual" = "$expected" ]; then
        echo "[ ok ]"
    else
        echo "[ fail ]"
        echo " > expected '$expected', got '$actual'"
    fi
}

print_test() {
    message=$1

    printf "Test %03d: %s... " "$TEST_INDEX" "$message"
    TEST_INDEX=$((TEST_INDEX + 1))
}

run_test() {
    message=$1
    expected=$2
    test_function=$3

    print_test "$message"
    actual=$($test_function 2>&1) || { echo "[ fail ]"; echo " > $actual"; return; }

    assert_equal "$expected" "$actual"
}

run_failing_test() {
    message=$1
    exit_code=$2
    test_function=$3

    print_test "$message"
    if actual="$($test_function)"; then
        echo "[ fail ]"
        echo " > expected failure, got '$actual'"
        return
    else
        actual_exit_code=$?
        if [ "$actual_exit_code" -eq "$exit_code" ]; then
            echo "[ ok ]"
        else
            echo "[ fail ]"
            echo " > expected exit code $exit_code, got $actual_exit_code"
        fi
    fi
}