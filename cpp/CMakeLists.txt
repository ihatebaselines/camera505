cmake_minimum_required(VERSION 3.16)
project(life_cpp_engine CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Optimization flags
if(MSVC)
    add_compile_options(/O2 /W3)
else()
    add_compile_options(-O2 -Wall -Wextra)
endif()

# ============================================================
# Hardware Interface (no external dependencies)
# ============================================================
add_executable(life_hw
    life_hardware_interface.cpp
)

# ============================================================
# DuckDB Engine (requires duckdb library)
# ============================================================
# Option 1: Find system DuckDB (if installed)
find_library(DUCKDB_LIB duckdb HINTS
    "$ENV{DUCKDB_DIR}/lib"
    "C:/duckdb/lib"
    "/usr/local/lib"
    "/usr/lib"
)
find_path(DUCKDB_INCLUDE duckdb.hpp HINTS
    "$ENV{DUCKDB_DIR}/include"
    "C:/duckdb/include"
    "/usr/local/include"
    "/usr/include"
)

if(DUCKDB_LIB AND DUCKDB_INCLUDE)
    message(STATUS "Found DuckDB: ${DUCKDB_LIB}")
    add_executable(life_db life_db_engine.cpp)
    target_include_directories(life_db PRIVATE ${DUCKDB_INCLUDE})
    target_link_libraries(life_db PRIVATE ${DUCKDB_LIB})
else()
    message(WARNING "DuckDB not found. Run scripts/download_duckdb.py to fetch the headers.")
    message(STATUS "life_hw (hardware interface) will still be built.")
endif()

# ============================================================
# Install targets
# ============================================================
install(TARGETS life_hw DESTINATION bin)
if(TARGET life_db)
    install(TARGETS life_db DESTINATION bin)
endif()
