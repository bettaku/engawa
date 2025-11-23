//! escape SQL

pub fn sql_like_escape(s: &str) -> String {
    let count = s
        .chars()
        .filter(|&c| c == '\\' || c == '%' || c == '_')
        .count();

    if count == 0 {
        return s.to_string();
    }

    let mut result = String::with_capacity(s.len() + count);

    for c in s.chars() {
        match c {
            '\\' | '%' | '_' => {
                result.push('\\');
                result.push(c);
            }
            _ => result.push(c),
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sql_like() {
        assert_eq!(sql_like_escape("test strings"), "test strings");
        assert_eq!(sql_like_escape("%"), "\\%");
    }
}
