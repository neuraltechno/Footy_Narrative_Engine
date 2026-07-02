##########################################################
# Module
#
# Name:
#
# Helpers
#
# Purpose:
#
# Generic helper functions
#
##########################################################

library(jsonlite)
library(dplyr)

##########################################################
# Save JSON File
#
# Description:
#
# Exports a data frame or list to a JSON file.
#
# Inputs:
#
# data, file_path
#
# Returns:
#
# None
#
##########################################################
save_json_file <- function(data, file_path) {
    json_data <- jsonlite::toJSON(data, pretty = TRUE, auto_unbox = TRUE)
    write(json_data, file = file_path)
}
