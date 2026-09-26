package com.ats.recruitment.entity;

import com.ats.recruitment.entity.enums.RoleName;
import jakarta.persistence.*;
import lombok.*;

import java.util.HashSet;
import java.util.Set;

/**
 * Entity đại diện cho vai trò trong hệ thống.
 * Mỗi vai trò có một mã duy nhất (RoleName) và mô tả.
 */
@Entity
@Table(name = "roles")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Role {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(name = "name", nullable = false, unique = true, length = 30)
    private RoleName name;

    @Column(name = "description", length = 255)
    private String description;

    @ManyToMany(mappedBy = "roles")
    private Set<User> users = new HashSet<>();
}
